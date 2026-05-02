/**
 * src/pages/portal/PortalAuth.tsx  (replaces the PortalAuth export in Portal.tsx)
 *
 * FIX IN THIS VERSION:
 *
 *   FIX 1 — After login, re-fetch the profile fresh from DB before checking role.
 *     The old code called supabase.auth.getUser() + a manual profile select
 *     after signIn. But AuthContext's fetchProfile runs async in the background
 *     via onAuthStateChange. If the manual check ran first and found role =
 *     'user' (stale), it would sign the client out immediately, even though
 *     their DB role is 'client'. Now we query the profile directly right after
 *     auth, with no dependency on AuthContext timing.
 *
 *   FIX 2 — Redirect after login goes to /portal (PortalGuard handles the rest).
 *     Previously it navigated to '/portal' but PortalDashboard was unguarded,
 *     so there was a role-check race. Now PortalGuard owns the role check.
 *
 * Paste this component into Portal.tsx to replace the existing PortalAuth export.
 */

import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { supabase }            from '@/integrations/supabase/client';
import { useAuth }             from '@/contexts/AuthContext';
import { Button }              from '@/components/ui/button';
import { Input }               from '@/components/ui/input';
import { Label }               from '@/components/ui/label';
import { useToast }            from '@/hooks/use-toast';
import { Building2 }           from 'lucide-react';

export function PortalAuth() {
  const { signIn, user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  // If already logged in as a client, go straight to portal
  useEffect(() => {
    if (user && profile) {
      if (profile.role === 'client') {
        navigate('/portal', { replace: true });
      } else {
        // Staff who landed on /portal/auth → send to dashboard
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast({ variant: 'destructive', title: 'Login failed', description: error.message });
      setLoading(false);
      return;
    }

    // FIX 1: Query the profile directly — don't rely on AuthContext timing.
    // onAuthStateChange fires and fetchProfile runs async; if we check
    // AuthContext's profile here it may still be null or stale.
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) {
      toast({ variant: 'destructive', title: 'Login failed', description: 'Could not retrieve user.' });
      setLoading(false);
      return;
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('role, company_id')
      .eq('id', u.id)
      .single();

    if (prof?.role !== 'client') {
      toast({
        variant:     'destructive',
        title:       'Access denied',
        description: 'This portal is for clients only. Use the staff login instead.',
      });
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    // FIX 2: Navigate to /portal — PortalGuard will verify role and render dashboard
    navigate('/portal', { replace: true });
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50/30 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Client Portal</h1>
          <p className="text-slate-500 mt-1">Z IT Solutions — Secure Client Access</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label>Email address</Label>
              <Input
                type="email"
                required
                autoFocus
                autoComplete="username"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in to Portal'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Staff login?{' '}
          <a href="/auth" className="text-indigo-600 hover:underline">Go to dashboard</a>
        </p>
      </div>
    </div>
  );
}