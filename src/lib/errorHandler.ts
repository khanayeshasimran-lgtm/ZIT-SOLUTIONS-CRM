/**
 * lib/errorHandler.ts
 *
 * Single source of truth for all runtime errors.
 *
 * Usage:
 *   import { handleError, AppError, ErrorCode } from '@/lib/errorHandler';
 *
 *   try { ... }
 *   catch (err) { handleError(err, { context: 'createLead', toast }) }
 *
 * Sentry:
 *   Install: npm install @sentry/react
 *   Then uncomment the Sentry lines below.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// import * as Sentry from '@sentry/react';  // ← uncomment after install

// ── Error codes ────────────────────────────────────────────────────────────────

export const ErrorCode = {
  PERMISSION_DENIED:   'PERMISSION_DENIED',
  VALIDATION_ERROR:    'VALIDATION_ERROR',
  NOT_FOUND:           'NOT_FOUND',
  NETWORK_ERROR:       'NETWORK_ERROR',
  SUPABASE_ERROR:      'SUPABASE_ERROR',
  UNKNOWN:             'UNKNOWN',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

// ── AppError class ─────────────────────────────────────────────────────────────

export class AppError extends Error {
  code:     ErrorCodeType;
  context?: string;
  meta?:    Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCodeType = ErrorCode.UNKNOWN,
    options?: { context?: string; meta?: Record<string, unknown> }
  ) {
    super(message);
    this.name    = 'AppError';
    this.code    = code;
    this.context = options?.context;
    this.meta    = options?.meta;
  }
}

// ── Error classifier ───────────────────────────────────────────────────────────

function classify(err: unknown): { code: ErrorCodeType; message: string } {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message };
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    if (msg.includes('permission denied') || msg.includes('forbidden') || msg.includes('rls'))
      return { code: ErrorCode.PERMISSION_DENIED, message: 'You do not have permission to perform this action.' };

    if (msg.includes('not found') || msg.includes('no rows'))
      return { code: ErrorCode.NOT_FOUND, message: 'The requested record was not found.' };

    if (msg.includes('validation') || msg.includes('invalid'))
      return { code: ErrorCode.VALIDATION_ERROR, message: err.message };

    if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch'))
      return { code: ErrorCode.NETWORK_ERROR, message: 'Network error — please check your connection.' };

    if (msg.includes('pgrst') || msg.includes('supabase'))
      return { code: ErrorCode.SUPABASE_ERROR, message: 'Database error — please try again.' };

    return { code: ErrorCode.UNKNOWN, message: err.message };
  }

  return { code: ErrorCode.UNKNOWN, message: 'An unexpected error occurred.' };
}

// ── User-friendly messages ─────────────────────────────────────────────────────

const USER_MESSAGES: Record<ErrorCodeType, string> = {
  PERMISSION_DENIED: 'You don\'t have permission to do that.',
  VALIDATION_ERROR:  'Please check your input and try again.',
  NOT_FOUND:         'That record no longer exists.',
  NETWORK_ERROR:     'Connection problem — check your internet.',
  SUPABASE_ERROR:    'Something went wrong on our end. Please retry.',
  UNKNOWN:           'Something went wrong. Please try again.',
};

// ── Toast adapter type ─────────────────────────────────────────────────────────
// Compatible with shadcn/ui useToast

interface ToastFn {
  (opts: { variant?: 'destructive'; title: string; description?: string }): void;
}

// ── Main handler ───────────────────────────────────────────────────────────────

interface HandleErrorOptions {
  context?:    string;
  toast?:      ToastFn;
  silent?:     boolean;   // suppress toast (still logs)
  rethrow?:    boolean;
}

export function handleError(
  err: unknown,
  options: HandleErrorOptions = {}
): AppError {
  const { code, message } = classify(err);
  const appErr = err instanceof AppError ? err : new AppError(message, code, { context: options.context });

  // ── Console log (always) ───────────────────────────────────────────────────
  console.error(
    `[handleError]${options.context ? ` (${options.context})` : ''}`,
    { code, message, original: err }
  );

  // ── Sentry (uncomment after install) ──────────────────────────────────────
  // Sentry.captureException(appErr, {
  //   tags:  { errorCode: code, context: options.context ?? 'unknown' },
  //   extra: { original: String(err) },
  // });

  // ── Toast ──────────────────────────────────────────────────────────────────
  if (options.toast && !options.silent) {
    options.toast({
      variant:     'destructive',
      title:       USER_MESSAGES[code] ?? USER_MESSAGES.UNKNOWN,
      description: message !== USER_MESSAGES[code] ? message : undefined,
    });
  }

  if (options.rethrow) throw appErr;

  return appErr;
}

// ── Async wrapper helper ───────────────────────────────────────────────────────
// Wraps any async fn and returns [data, error] tuple — no try/catch boilerplate

export async function safeAsync<T>(
  fn: () => Promise<T>,
  context?: string
): Promise<[T, null] | [null, AppError]> {
  try {
    const data = await fn();
    return [data, null];
  } catch (err) {
    const appErr = handleError(err, { context, silent: true });
    return [null, appErr];
  }
}