/**
 * lib/sanitize.ts
 *
 * Input sanitization layer — prevents XSS across all user-entered text.
 *
 * Install: npm install dompurify @types/dompurify
 *
 * Usage:
 *   import { sanitize, sanitizeObject } from '@/lib/sanitize';
 *
 *   const clean = sanitize(userInput);
 *   const cleanForm = sanitizeObject({ title: rawTitle, description: rawDesc });
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Dynamic import so this doesn't break SSR / tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DOMPurify: any = null;

async function getPurify() {
  if (!DOMPurify) {
    const mod = await import('dompurify');
    DOMPurify = mod.default ?? mod;
  }
  return DOMPurify;
}

// ── Config presets ─────────────────────────────────────────────────────────────

/** Strip ALL HTML — use for plain text fields (names, titles, phone numbers) */
const PLAIN_TEXT_CONFIG = {
  ALLOWED_TAGS:  [] as string[],
  ALLOWED_ATTR:  [] as string[],
};

/** Allow safe formatting — use for rich text / descriptions / notes */
const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS:  ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a'],
  ALLOWED_ATTR:  ['href', 'target'],
};

// ── Core sanitizer ─────────────────────────────────────────────────────────────

/**
 * Sanitize a single string value.
 * @param value  Raw user input
 * @param mode   'plain' (default) strips all HTML; 'rich' allows safe tags
 */
export async function sanitize(
  value: string,
  mode: 'plain' | 'rich' = 'plain'
): Promise<string> {
  if (!value || typeof value !== 'string') return value ?? '';

  const purify = await getPurify();
  const config = mode === 'rich' ? RICH_TEXT_CONFIG : PLAIN_TEXT_CONFIG;

  // @ts-ignore — DOMPurify types vary by package version
  return purify.sanitize(value.trim(), config);
}

/**
 * Synchronous sanitizer for environments where async isn't possible.
 * Falls back to basic HTML escape if DOMPurify isn't loaded yet.
 */
export function sanitizeSync(value: string): string {
  if (!value || typeof value !== 'string') return value ?? '';

  if (DOMPurify) {
    // @ts-ignore
    return DOMPurify.sanitize(value.trim(), PLAIN_TEXT_CONFIG);
  }

  // Basic fallback — no DOMPurify loaded yet
  return value
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize all string fields in a plain object.
 * Non-string values pass through unchanged.
 *
 * @example
 *   const clean = await sanitizeObject({ title: raw.title, notes: raw.notes });
 */
export async function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  richFields: (keyof T)[] = []
): Promise<T> {
  const result = { ...obj };

  for (const key of Object.keys(result) as (keyof T)[]) {
    const value = result[key];
    if (typeof value === 'string') {
      const mode = richFields.includes(key) ? 'rich' : 'plain';
      (result as Record<keyof T, unknown>)[key] = await sanitize(value, mode);
    }
  }

  return result;
}

// ── Field-level validators ─────────────────────────────────────────────────────

/** Trim + lowercase + basic email char validation */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9@._+-]/g, '');
}

/** Strip non-digit/space/+/- chars from phone */
export function normalizePhone(phone: string): string {
  return phone.trim().replace(/[^0-9\s+\-().]/g, '');
}

/** Strip potential injection chars from a free-text search query */
export function sanitizeSearchQuery(query: string): string {
  return query.trim().replace(/[<>'"`;]/g, '').slice(0, 200);
}