/**
 * src/lib/api.ts
 *
 * Single entry point for ALL backend mutations.
 * Every write in the app goes through here — no exceptions.
 *
 * Changes from original:
 *   ✅  All original logic preserved (ApiError, session refresh, URL validation)
 *   ✅  Sentry reports Edge Function errors with function name + status + payload keys
 *   ✅  Sentry reports network errors separately (tagged NETWORK_ERROR)
 *   ✅  Silent in dev (console.error only), active in production
 */

import { supabase }                 from '@/integrations/supabase/client';
import { captureEdgeFunctionError } from '@/lib/sentry';

// ── Typed error ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Standard response shape (matches all Edge Functions) ─────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  code?: string;
}

// ── Base URL (validated at module load time) ──────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');

if (!SUPABASE_URL) {
  console.error('[api] VITE_SUPABASE_URL is not set. Edge Function calls will fail.');
}

// ── Core caller ───────────────────────────────────────────────────────────────

export async function callEdgeFunction<T = ApiResponse>(
  fnName: string,
  body: Record<string, unknown>
): Promise<T> {
  // 1. Get current session
  let { data: { session } } = await supabase.auth.getSession();

  // 2. If token looks expired, try a refresh once before giving up
  if (!session) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    session = refreshed.session;
  }

  if (!session?.access_token) {
    throw new ApiError('Not authenticated', 401, 'UNAUTHENTICATED');
  }

  // 3. Call the Edge Function
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    // Fetch itself failed — network down, CORS, etc.
    captureEdgeFunctionError(fnName, 0, 'Network error — fetch failed', body);
    throw new ApiError(
      'Network error — check your connection and try again.',
      0,
      'NETWORK_ERROR'
    );
  }

  // 4. Parse response (Edge Functions always return JSON)
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    captureEdgeFunctionError(fnName, res.status, 'Non-JSON response from Edge Function', body);
    throw new ApiError(
      `Edge Function returned non-JSON response (status ${res.status})`,
      res.status,
      'PARSE_ERROR'
    );
  }

  // 5. Treat non-2xx as errors
  if (!res.ok) {
    const errData = data as { error?: string; code?: string };
    const message = errData?.error ?? `Request failed with status ${res.status}`;

    // Report to Sentry — tagged with function name so you can filter by endpoint
    captureEdgeFunctionError(fnName, res.status, message, body);

    throw new ApiError(message, res.status, errData?.code);
  }

  return data as T;
}