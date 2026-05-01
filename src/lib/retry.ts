/**
 * lib/retry.ts
 *
 * Wraps any async function with automatic retry logic.
 * Use this around Supabase mutations so transient network
 * failures don't silently lose data.
 *
 * Design decision:
 * We use `any` deliberately here. Supabase's query builders are
 * PostgrestFilterBuilder / PostgrestBuilder — "thenables" but not
 * plain Promise<T>. Fighting their types inside a generic wrapper
 * causes cascading `unknown` errors downstream. Instead we type
 * the RETURN as `any` and let each call site cast what it needs.
 * This matches exactly how the rest of your codebase uses `(supabase as any)`.
 *
 * Usage:
 *   const { data, error } = await retryMutation(() =>
 *     (supabase as any).from('leads').insert(payload).select().single()
 *   );
 */

interface RetryOptions {
  maxRetries?: number;  // default 3
  delayMs?: number;     // base delay in ms, doubles each attempt (default 400)
  onRetry?: (attempt: number, error: unknown) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function retryMutation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: () => any,
  options: RetryOptions = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { maxRetries = 3, delayMs = 400, onRetry } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();

      // Supabase returns { data, error } — never throws.
      // If it's a non-retryable DB error, return immediately.
      if (result?.error) {
        const msg: string = (result.error.message ?? '').toLowerCase();
        const isNonRetryable =
          msg.includes('violates') ||       // FK / unique constraint
          msg.includes('invalid input') ||
          msg.includes('permission denied') ||
          msg.includes('duplicate key') ||
          msg.includes('jwt');

        if (isNonRetryable || attempt === maxRetries) {
          return result;
        }

        // Retryable Supabase error — wait and try again
        lastError = result.error;
        onRetry?.(attempt, result.error);
        await sleep(delayMs, attempt);
        continue;
      }

      return result;
    } catch (err) {
      // Actual thrown exception (network timeout, etc.)
      lastError = err;
      if (attempt === maxRetries) break;

      if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        if (
          msg.includes('violates') ||
          msg.includes('invalid input') ||
          msg.includes('permission denied') ||
          msg.includes('jwt')
        ) {
          throw err;
        }
      }

      onRetry?.(attempt, err);
      await sleep(delayMs, attempt);
    }
  }

  throw lastError;
}

function sleep(baseMs: number, attempt: number): Promise<void> {
  return new Promise(res => setTimeout(res, baseMs * Math.pow(2, attempt - 1)));
}