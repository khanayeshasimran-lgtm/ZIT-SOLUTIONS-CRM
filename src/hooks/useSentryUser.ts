/**
 * src/hooks/useSentryUser.ts
 *
 * Call this once inside AuthProvider (or any component that has access
 * to the auth session). It keeps Sentry's user context in sync with
 * the logged-in user so every error is tagged with who caused it.
 *
 * Usage — add to AuthContext.tsx or a top-level layout component:
 *
 *   import { useSentryUser } from '@/hooks/useSentryUser';
 *   useSentryUser();   // ← just call it, no args needed
 */

import { useEffect } from 'react';
import { useAuth }   from '@/contexts/AuthContext';
import { setSentryUser } from '@/lib/sentry';

export function useSentryUser() {
  const { session, profile } = useAuth();

  useEffect(() => {
    if (session?.user && profile) {
      setSentryUser({
        id:             session.user.id,
        email:          session.user.email,
        role:           (profile as any).role          ?? null,
        organizationId: (profile as any).organization_id ?? null,
      });
    } else {
      setSentryUser(null);
    }
  }, [session, profile]);
}