/**
 * supabase/functions/ai-suggest-email/index.ts
 *
 * Generates 3 contextual email drafts for a lead or deal using Google Gemini (free).
 *
 * Security:
 *   ✅ JWT required
 *   ✅ Rate limited: 10 requests/hour/user (configurable via RATE_LIMIT_AI_EMAIL env var)
 *   ✅ Prompt injection protection — user-supplied fields are escaped and sandboxed
 *   ✅ Response cached by content hash for 24h — same lead state = same response
 *   ✅ All requests logged to ai_requests table
 *   ✅ No raw user input ever concatenated directly into the prompt
 *
 * Deploy: supabase functions deploy ai-suggest-email
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z }            from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ── Input schema ──────────────────────────────────────────────────────────────

const RequestSchema = z.object({
  lead_id:  z.string().uuid().optional(),
  deal_id:  z.string().uuid().optional(),
  tone: z.enum(['professional', 'friendly', 'urgent', 'follow_up']).default('professional'),
  goal: z.enum([
    'introduction',
    'follow_up',
    'proposal',
    'check_in',
    'win_back',
    'meeting_request',
  ]).default('follow_up'),
}).refine(d => d.lead_id || d.deal_id, {
  message: 'Either lead_id or deal_id is required',
});

// ── Expected AI response shape ────────────────────────────────────────────────

interface EmailSuggestion {
  subject:   string;
  body:      string;
  tone:      string;
  rationale: string;
}

interface AIResponse {
  suggestions: EmailSuggestion[];
  context_used: {
    name:                string;
    stage?:              string;
    source?:             string;
    days_since_contact?: number;
  };
}

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

const RATE_LIMIT = parseInt(Deno.env.get('RATE_LIMIT_AI_EMAIL') ?? '10');

async function checkRateLimit(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await adminClient
    .from('ai_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('feature', 'suggest_email')
    .eq('success', true)
    .gte('created_at', oneHourAgo);

  return (count ?? 0) >= RATE_LIMIT;
}

// ── Cache lookup ──────────────────────────────────────────────────────────────

async function getCachedResponse(
  adminClient: ReturnType<typeof createClient>,
  cacheKey: string
): Promise<AIResponse | null> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await adminClient
    .from('ai_requests')
    .select('response_cache')
    .eq('cache_key', cacheKey)
    .eq('feature', 'suggest_email')
    .eq('success', true)
    .eq('cached', false)
    .gte('created_at', oneDayAgo)
    .limit(1)
    .single();

  return (data?.response_cache as AIResponse) ?? null;
}

// ── Cache key builder ─────────────────────────────────────────────────────────

function buildCacheKey(parts: string[]): string {
  return parts.join('|').slice(0, 200);
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(context: {
  name:               string;
  email:              string | null;
  source:             string | null;
  status:             string | null;
  stage:              string | null;
  value:              number | null;
  days_since_contact: number | null;
  last_activity:      string | null;
  deal_title:         string | null;
  tone:               string;
  goal:               string;
}): string {
  const sanitise = (s: string | null) =>
    s ? s.replace(/["""\\]/g, '').slice(0, 200) : null;

  const name         = sanitise(context.name)         ?? 'the contact';
  const source       = sanitise(context.source)       ?? 'unknown';
  const status       = sanitise(context.status)       ?? 'new';
  const stage        = sanitise(context.stage)        ?? null;
  const dealTitle    = sanitise(context.deal_title)   ?? null;
  const lastActivity = sanitise(context.last_activity) ?? null;

  const contextBlock = JSON.stringify({
    contact_name:        name,
    lead_source:         source,
    lead_status:         status,
    deal_stage:          stage,
    deal_title:          dealTitle,
    deal_value_usd:      context.value,
    days_since_contact:  context.days_since_contact,
    last_activity_type:  lastActivity,
    desired_tone:        context.tone,
    email_goal:          context.goal,
    company:             'Z IT Solutions',
  }, null, 2);

  return `You are an expert B2B sales email writer for an IT services company called Z IT Solutions.

You will receive structured CRM context and must generate exactly 3 distinct email drafts.

IMPORTANT RULES:
- Use ONLY the information provided in the context block below
- Do NOT invent facts, company names, meeting dates, or specific details not in the context
- Do NOT use placeholder text like [Company Name] or [Date] — write complete, sendable emails
- Each suggestion must have a distinctly different angle/approach
- Keep emails concise: subject under 60 chars, body under 200 words
- The sender is always a sales rep at Z IT Solutions

CONTEXT:
${contextBlock}

Respond with ONLY valid JSON matching this exact schema — no markdown, no preamble:
{
  "suggestions": [
    {
      "subject": "string (under 60 chars)",
      "body": "string (complete email body, under 200 words, no placeholders)",
      "tone": "string (describe the tone used)",
      "rationale": "string (1 sentence: why this approach for this context)"
    }
  ],
  "context_used": {
    "name": "string",
    "stage": "string or null",
    "source": "string or null",
    "days_since_contact": "number or null"
  }
}`;
}

// ── Gemini API call ───────────────────────────────────────────────────────────
// Uses gemini-1.5-flash — free tier: 15 RPM, 1M tokens/day via Google AI Studio

const GEMINI_MODEL = 'gemini-1.5-flash';

async function callGemini(prompt: string): Promise<{
  response:         AIResponse;
  promptTokens:     number;
  completionTokens: number;
}> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature:     0.7,
        maxOutputTokens: 1500,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();

  // Extract text from Gemini response shape
  const rawText: string =
    data.candidates?.[0]?.content?.parts
      ?.filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join('') ?? '';

  // Strip any accidental markdown fences
  const cleaned = rawText
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();

  let parsed: AIResponse;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${cleaned.slice(0, 300)}`);
  }

  if (!Array.isArray(parsed.suggestions) || parsed.suggestions.length === 0) {
    throw new Error('Gemini response missing suggestions array');
  }

  const usage = data.usageMetadata ?? {};

  return {
    response:         parsed,
    promptTokens:     usage.promptTokenCount     ?? 0,
    completionTokens: usage.candidatesTokenCount ?? 0,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let userId = '';
  let orgId  = '';

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    userId = user.id;

    const { data: profile } = await adminClient
      .from('profiles')
      .select('organization_id, role')
      .eq('id', userId)
      .single();

    orgId = profile?.organization_id ?? '';

    // ── 2. Rate limit ────────────────────────────────────────────────────────
    if (await checkRateLimit(adminClient, userId)) {
      return json({
        error: `Rate limit exceeded — max ${RATE_LIMIT} email suggestions per hour`,
        code:  'RATE_LIMITED',
      }, 429);
    }

    // ── 3. Validate input ────────────────────────────────────────────────────
    let body: unknown;
    try { body = await req.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    const parsedInput = RequestSchema.safeParse(body);
    if (!parsedInput.success) {
      return json({ error: 'Validation error', details: parsedInput.error.issues }, 400);
    }

    const { lead_id, deal_id, tone, goal } = parsedInput.data;

    // ── 4. Load entity context ───────────────────────────────────────────────
    let context: Parameters<typeof buildPrompt>[0];
    let entityType: string;
    let entityId:   string;

    if (lead_id) {
      entityType = 'lead';
      entityId   = lead_id;

      const { data: lead, error: leadErr } = await adminClient
        .from('leads')
        .select('id, name, email, source, status, last_contacted_at, created_at')
        .eq('id', lead_id)
        .is('deleted_at', null)
        .single();

      if (leadErr || !lead) return json({ error: 'Lead not found' }, 404);

      const { data: lastAct } = await adminClient
        .from('activities')
        .select('type')
        .eq('lead_id', lead_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const daysSince = lead.last_contacted_at
        ? Math.floor((Date.now() - new Date(lead.last_contacted_at).getTime()) / 86_400_000)
        : Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86_400_000);

      context = {
        name:               lead.name,
        email:              lead.email,
        source:             lead.source,
        status:             lead.status,
        stage:              null,
        value:              null,
        days_since_contact: daysSince,
        last_activity:      lastAct?.type ?? null,
        deal_title:         null,
        tone,
        goal,
      };

    } else {
      entityType = 'deal';
      entityId   = deal_id!;

      const { data: deal, error: dealErr } = await adminClient
        .from('deals')
        .select('id, title, stage, value, probability, expected_close_date, created_at, leads(name, email, source, status, last_contacted_at)')
        .eq('id', deal_id!)
        .single();

      if (dealErr || !deal) return json({ error: 'Deal not found' }, 404);

      const lead = (deal.leads as any) ?? {};
      const daysSince = lead.last_contacted_at
        ? Math.floor((Date.now() - new Date(lead.last_contacted_at).getTime()) / 86_400_000)
        : Math.floor((Date.now() - new Date(deal.created_at).getTime()) / 86_400_000);

      context = {
        name:               lead.name ?? 'the contact',
        email:              lead.email ?? null,
        source:             lead.source ?? null,
        status:             lead.status ?? null,
        stage:              deal.stage,
        value:              Number(deal.value),
        days_since_contact: daysSince,
        last_activity:      null,
        deal_title:         deal.title,
        tone,
        goal,
      };
    }

    // ── 5. Check cache ───────────────────────────────────────────────────────
    const cacheKey = buildCacheKey([
      'suggest_email', entityId, tone, goal,
      String(context.status ?? ''), String(context.stage ?? ''),
      String(context.days_since_contact ?? ''),
    ]);

    const cached = await getCachedResponse(adminClient, cacheKey);
    if (cached) {
      await adminClient.from('ai_requests').insert([{
        organization_id:   orgId || null,
        user_id:           userId,
        feature:           'suggest_email',
        entity_type:       entityType,
        entity_id:         entityId,
        model:             GEMINI_MODEL,
        cached:            true,
        success:           true,
        cache_key:         cacheKey,
        prompt_tokens:     0,
        completion_tokens: 0,
        total_tokens:      0,
      }]);

      return json({ success: true, data: cached, cached: true });
    }

    // ── 6. Call Gemini ───────────────────────────────────────────────────────
    const prompt = buildPrompt(context);
    let aiResult: Awaited<ReturnType<typeof callGemini>>;

    try {
      aiResult = await callGemini(prompt);
    } catch (err) {
      await adminClient.from('ai_requests').insert([{
        organization_id: orgId || null,
        user_id:         userId,
        feature:         'suggest_email',
        entity_type:     entityType,
        entity_id:       entityId,
        model:           GEMINI_MODEL,
        cached:          false,
        success:         false,
        error_message:   String(err),
      }]);

      console.error('[ai-suggest-email] Gemini error:', err);
      return json({ error: 'AI generation failed — please try again', code: 'AI_ERROR' }, 502);
    }

    // ── 7. Log success + cache response ─────────────────────────────────────
    await adminClient.from('ai_requests').insert([{
      organization_id:   orgId || null,
      user_id:           userId,
      feature:           'suggest_email',
      entity_type:       entityType,
      entity_id:         entityId,
      model:             GEMINI_MODEL,
      cached:            false,
      success:           true,
      cache_key:         cacheKey,
      response_cache:    aiResult.response,
      prompt_tokens:     aiResult.promptTokens,
      completion_tokens: aiResult.completionTokens,
      total_tokens:      aiResult.promptTokens + aiResult.completionTokens,
    }]);

    return json({ success: true, data: aiResult.response, cached: false });

  } catch (err) {
    console.error('[ai-suggest-email] Unhandled error:', err);

    if (userId) {
      await adminClient.from('ai_requests').insert([{
        organization_id: orgId || null,
        user_id:         userId,
        feature:         'suggest_email',
        model:           GEMINI_MODEL,
        success:         false,
        error_message:   String(err),
      }]).catch(() => {});
    }

    return json({ error: 'Internal server error' }, 500);
  }
});