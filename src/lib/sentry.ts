/**
 * src/lib/sentry.ts
 *
 * Sentry initialisation + helper utilities.
 * Import this ONCE at the top of main.tsx — all other files use the helpers.
 */

import * as Sentry from '@sentry/react';

// ── Init ──────────────────────────────────────────────────────────────────────

export function initSentry() {
  Sentry.init({
    dsn:         import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,                    // 'development' | 'production'
    enabled:     import.meta.env.MODE === 'production',   // silent in dev, active in prod
    tracesSampleRate:   import.meta.env.MODE === 'production' ? 0.2 : 1.0,
    replaysSessionSampleRate: 0,                          // no session replays (saves quota)
    replaysOnErrorSampleRate: 0.5,                        // capture replay on errors only
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    // Strip auth tokens from breadcrumbs
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
        if (breadcrumb.data?.url?.includes('supabase')) {
          delete breadcrumb.data.response;
        }
      }
      return breadcrumb;
    },
    // Scrub sensitive fields before sending
    beforeSend(event) {
      if (event.request?.cookies) delete event.request.cookies;
      return event;
    },
  });
}

// ── User context ──────────────────────────────────────────────────────────────

/**
 * Call this after login so every subsequent error is tagged with who caused it.
 * Call with null on logout to clear.
 */
export function setSentryUser(user: {
  id: string;
  email?: string | null;
  role?: string | null;
  organizationId?: string | null;
} | null) {
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id:    user.id,
    email: user.email ?? undefined,
    role:  user.role  ?? undefined,
    // custom tag — lets you filter by org in Sentry dashboard
    organization_id: user.organizationId ?? undefined,
  });
}

// ── Error capture helpers ─────────────────────────────────────────────────────

/**
 * Capture an Error object with optional extra context.
 * Use this in catch blocks instead of console.error in production code.
 */
export function captureError(
  error: unknown,
  context?: Record<string, unknown>
) {
  if (import.meta.env.DEV) {
    console.error('[Sentry capture]', error, context);
    return;
  }
  Sentry.withScope(scope => {
    if (context) scope.setExtras(context);
    Sentry.captureException(error);
  });
}

/**
 * Capture a plain message (non-error event).
 * Useful for tracking important user actions or unexpected states.
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, unknown>
) {
  if (import.meta.env.DEV) {
    console.info(`[Sentry message:${level}]`, message, context);
    return;
  }
  Sentry.withScope(scope => {
    if (context) scope.setExtras(context);
    Sentry.captureMessage(message, level);
  });
}

// ── Edge Function error helper ────────────────────────────────────────────────

/**
 * Call this when an Edge Function returns an error response.
 * Tags the event with the function name so you can filter by endpoint.
 */
export function captureEdgeFunctionError(
  functionName: string,
  status: number,
  errorMessage: string,
  payload?: unknown
) {
  if (import.meta.env.DEV) {
    console.error(`[EdgeFn error] ${functionName} → ${status}: ${errorMessage}`);
    return;
  }
  Sentry.withScope(scope => {
    scope.setTag('edge_function', functionName);
    scope.setExtra('http_status', status);
    scope.setExtra('payload_keys', payload ? Object.keys(payload as object) : []);
    Sentry.captureMessage(
      `Edge Function "${functionName}" failed: ${errorMessage}`,
      'error'
    );
  });
}