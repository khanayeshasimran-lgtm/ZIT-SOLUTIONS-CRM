/**
 * src/services/ai.service.ts
 *
 * Typed client-side service for all AI features.
 * All calls go through callEdgeFunction — JWT handled automatically.
 *
 * Features in this file:
 *   ✅ suggestEmail    — 3 email drafts for a lead or deal (powered by Google Gemini)
 *   🔜 meetingSummary  — auto-summary from meeting notes (Tier 3 next)
 *   🔜 nextAction      — ranked next-best-action recommendations
 *   🔜 revenueForecast — AI-driven pipeline forecast
 *   🔜 chatQuery       — internal AI chatbot
 */

import { callEdgeFunction } from '@/lib/api';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface AiRequestMeta {
  cached: boolean;
  tokens_used?: number;
}

// ── suggest-email ─────────────────────────────────────────────────────────────

export type EmailTone     = 'professional' | 'friendly' | 'urgent' | 'follow_up';
export type EmailGoal     =
  | 'introduction'
  | 'follow_up'
  | 'proposal'
  | 'check_in'
  | 'win_back'
  | 'meeting_request';

export interface EmailSuggestion {
  subject:   string;
  body:      string;
  tone:      string;
  rationale: string;
}

export interface SuggestEmailResponse {
  suggestions:  EmailSuggestion[];
  context_used: {
    name:                string;
    stage?:              string | null;
    source?:             string | null;
    days_since_contact?: number | null;
  };
}

export interface SuggestEmailResult {
  data:   SuggestEmailResponse;
  cached: boolean;
}

/**
 * suggestEmail
 *
 * Generates 3 contextual email drafts for a lead or deal.
 * Powered by Google Gemini 1.5 Flash (free tier).
 * Rate limited to 10 requests/hour/user server-side.
 * Responses are cached for 24h — same lead state returns instantly.
 *
 * @param params.lead_id  — use for lead-level outreach
 * @param params.deal_id  — use for deal-stage outreach (preferred when deal exists)
 * @param params.tone     — desired email tone (default: 'professional')
 * @param params.goal     — email goal (default: 'follow_up')
 */
export async function suggestEmail(params: {
  lead_id?: string;
  deal_id?: string;
  tone?:    EmailTone;
  goal?:    EmailGoal;
}): Promise<SuggestEmailResult> {
  if (!params.lead_id && !params.deal_id) {
    throw new Error('suggestEmail requires either lead_id or deal_id');
  }

  const res = await callEdgeFunction<{
    success: boolean;
    data:    SuggestEmailResponse;
    cached:  boolean;
    error?:  string;
    code?:   string;
  }>('ai-suggest-email', {
    lead_id: params.lead_id ?? undefined,
    deal_id: params.deal_id ?? undefined,
    tone:    params.tone    ?? 'professional',
    goal:    params.goal    ?? 'follow_up',
  });

  if (!res.success || !res.data) {
    throw new Error(res.error ?? 'Failed to generate email suggestions');
  }

  return { data: res.data, cached: res.cached ?? false };
}