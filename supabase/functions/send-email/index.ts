import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z }            from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const NOTIF_EVENTS = ['deal_won', 'overdue_task', 'payment_due', 'idle_lead', 'new_ticket'] as const;

const SendEmailSchema = z.object({
  event:   z.enum(NOTIF_EVENTS),
  subject: z.string().min(1).max(300),
  body:    z.string().min(1).max(10_000),
  to:      z.array(z.string().email()).optional(),
  meta:    z.record(z.string()).optional(),
});

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

async function isRateLimited(adminClient: any, userId: string): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await adminClient
    .from('email_send_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('sent_at', oneHourAgo);
  return (count ?? 0) >= 10;
}

async function logEmailSend(adminClient: any, userId: string, event: string): Promise<void> {
  await adminClient.from('email_send_log').insert([{
    user_id: userId,
    event,
    sent_at: new Date().toISOString(),
  }]);
}

async function sendViaSendGrid(params: {
  to: string; subject: string; body: string;
}): Promise<boolean> {
  const apiKey    = Deno.env.get('SENDGRID_API_KEY');
  const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'noreply@zitsolutions.com';

  if (!apiKey) {
    console.warn('[send-email] SENDGRID_API_KEY not set — skipping send');
    return false;
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: params.to }] }],
      from:    { email: fromEmail, name: 'Z IT Solutions CRM' },
      subject: params.subject,
      content: [{ type: 'text/plain', value: params.body }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[send-email] SendGrid error:', err);
    return false;
  }

  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let body: unknown;
    try { body = await req.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    const parsed = SendEmailSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const { event, subject, body: emailBody } = parsed.data;

    const { data: profile } = await adminClient
      .from('profiles')
      .select('email, notification_prefs')
      .eq('id', user.id)
      .single();

    let emailEnabled = true;
    if (profile?.notification_prefs) {
      try {
        const prefs = typeof profile.notification_prefs === 'string'
          ? JSON.parse(profile.notification_prefs)
          : profile.notification_prefs;
        emailEnabled = prefs[event]?.email ?? true;
      } catch {}
    }

    if (!emailEnabled) {
      return json({ success: true, skipped: true, reason: 'Email disabled for this event' });
    }

    if (await isRateLimited(adminClient, user.id)) {
      return json({ error: 'Rate limit exceeded — max 10 emails per hour' }, 429);
    }

    const recipientEmail = profile?.email ?? user.email;
    if (!recipientEmail) {
      return json({ error: 'No recipient email found' }, 400);
    }

    const sent = await sendViaSendGrid({
      to:      recipientEmail,
      subject,
      body:    emailBody,
    });

    await logEmailSend(adminClient, user.id, event);

    return json({ success: true, sent, recipient: recipientEmail });

  } catch (err) {
    console.error('[send-email] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});