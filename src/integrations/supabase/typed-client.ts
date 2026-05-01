/**
 * src/integrations/supabase/typed-client.ts
 *
 * DAY 1 FIX: Typed Supabase client.
 *
 * STEP 1 — Generate the types (run this once, then commit the output):
 *
 *   npx supabase gen types typescript \
 *     --project-id YOUR_SUPABASE_PROJECT_ID \
 *     > src/types/supabase.ts
 *
 *   Replace YOUR_SUPABASE_PROJECT_ID with the ID from:
 *   Supabase dashboard → Settings → General → Reference ID
 *
 * STEP 2 — Use THIS client everywhere instead of the plain supabase client.
 *   Replace every:
 *     import { supabase } from '@/integrations/supabase/client';
 *   With:
 *     import { supabase } from '@/integrations/supabase/typed-client';
 *
 * STEP 3 — Delete every (supabase as any) cast.
 *   With the typed client, TypeScript will tell you at compile time if a
 *   column name is wrong, a filter field doesn't exist, or a insert payload
 *   is missing a required field. These are currently silent runtime bugs.
 *
 * WHY THIS MATTERS:
 *   The original codebase uses (supabase as any) on nearly every query.
 *   This disables all TypeScript safety on database calls. If a column is
 *   renamed in Supabase, nothing catches it until it crashes in production.
 *   The typed client makes every table, column, and relationship statically
 *   checked at build time.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// These are the same env vars used by the existing client — no change needed.
const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase environment variables.\n' +
    'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  );
}

/**
 * Typed Supabase client.
 * Use this everywhere. Never use (supabase as any).
 *
 * Example — typed query:
 *   const { data, error } = await supabase
 *     .from('leads')           // ← TypeScript knows the table exists
 *     .select('id, name, status')  // ← TypeScript knows these columns exist
 *     .eq('status', 'new')    // ← TypeScript validates the value type
 *     .range(0, 24);           // ← Always paginate
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: true,
  },
});

export type { Database };