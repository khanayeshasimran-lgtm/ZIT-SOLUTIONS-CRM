/**
 * src/App.tsx
 *
 * DAY 2 — C7: Fixed ProtectedRoutes auth race condition.
 * DAY 1 (carried forward): TourProvider added, providers correctly ordered.
 *
 * C7 — WHAT THE OLD CODE DID (WRONG):
 *   useEffect fired when: loading === false AND session exists AND profile exists.
 *   But AuthContext resolves `loading = false` as soon as the SESSION is known —
 *   profile loads in the background AFTER loading becomes false.
 *   This created a window where:
 *     loading = false  ✓
 *     session = exists ✓
 *     profile = null   ← profile hasn't arrived from DB yet
 *   The effect fired, saw organization_id as undefined (null profile), and
 *   redirected EVERY user to /onboarding on every hard refresh.
 *   Users who had completed onboarding were still redirected every time.
 *
 * C7 — THE FIX:
 *   Guard condition now requires ALL THREE to be truthy before the redirect:
 *     !loading && session && profile   (profile must be loaded, not null)
 *   If profile is null, the effect does nothing and waits for the next
 *   re-render (which fires when profile arrives from the background fetch).
 *   Only THEN does it check organization_id and redirect if needed.
 *
 * PROVIDER ORDER (correct):
 *   QueryClientProvider          — must be outermost (React Query)
 *     UIPreferencesProvider      — no dependencies
 *       AuthProvider             — Supabase auth, exposes user/profile/role
 *         OrganizationProvider   — reads useAuth(), must be inside AuthProvider
 *           TourProvider         — needs to be inside layout context
 *             TooltipProvider    — shadcn/ui tooltips
 *               BrowserRouter    — routing
 *                 Routes         — page routing
 */

import { Toaster }             from '@/components/ui/toaster';
import { Toaster as Sonner }   from '@/components/ui/sonner';
import { TooltipProvider }     from '@/components/ui/tooltip';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools }  from '@tanstack/react-query-devtools';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth }         from '@/contexts/AuthContext';
import { OrganizationProvider }          from '@/contexts/OrganizationContext';
import { TourProvider }                  from '@/contexts/TourContext';
import { UIPreferencesProvider }         from '@/contexts/UIPreferencesContext';
import { DashboardLayout }               from '@/components/layout/DashboardLayout';
import { AdminGuard }                    from '@/components/AdminGuard';
import { PageLoader }                    from '@/components/PageLoader';
import { ErrorBoundary }                 from '@/lib/errorBoundary';
import { queryClient }                   from '@/lib/queryClient';
import { useEffect }                     from 'react';
import { useNavigate }                   from 'react-router-dom';

// ── Pages ─────────────────────────────────────────────────────────────────────

import Auth            from './pages/Auth';
import Dashboard       from './pages/Dashboard';
import Leads           from './pages/Leads';
import Pipeline        from './pages/Pipeline';
import Contacts        from './pages/Contacts';
import Companies       from './pages/Companies';
import Activities      from './pages/Activities';
import Meetings        from './pages/Meetings';
import Templates       from './pages/Templates';
import OutreachTasks   from './pages/OutreachTasks';
import Projects        from './pages/Projects';
import SprintBoard     from './pages/SprintBoard';
import Documents       from './pages/Documents';
import Tickets         from './pages/Tickets';
import Interns         from './pages/Interns';
import Analytics       from './pages/Analytics';
import Settings        from './pages/Settings';
import NotFound        from './pages/NotFound';
import TimeTracking    from './pages/TimeTracking';
import TeamPerformance from './pages/TeamPerformance';
import Invoices        from './pages/Invoices';
import Automations     from './pages/Automations';
import Reports         from './pages/Reports';

import Users          from './pages/admin/Users';
import AuditLogs      from './pages/admin/AuditLogs';
import InvestorConfig from './pages/admin/InvestorConfig';
import Integrations   from './pages/admin/Integrations';

import InvestorDashboard               from './pages/investor/InvestorDashboard';
import { PortalAuth, PortalDashboard } from './pages/portal/Portal';
import Onboarding                      from './pages/onboarding/Onboarding';

// ── Protected route wrapper ───────────────────────────────────────────────────

const ProtectedRoutes = () => {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // C7 FIX: All three conditions must be true before we check org status.
    //
    // OLD (wrong):
    //   if (!loading && session && profile) { ... }
    //   Problem: loading becomes false BEFORE profile loads from the DB.
    //   When profile is null, organization_id is undefined, redirect fires.
    //
    // NEW (correct):
    //   Require profile to be non-null before reading organization_id.
    //   If profile hasn't loaded yet (!profile), do nothing — the effect
    //   will re-run when profile arrives (AuthContext calls setProfile async).
    if (loading) return;          // session not yet resolved — wait
    if (!session) return;         // not logged in — handled by Navigate below
    if (!profile) return;         // ← C7 FIX: profile not yet loaded — wait

    // Profile is fully loaded. Now check org and role.
    const hasOrg   = !!(profile as any).organization_id;
    const isClient = profile.role === 'client';

    // Client role never needs an organization (they access via portal)
    if (!hasOrg && !isClient) {
      navigate('/onboarding', { replace: true });
    }
  }, [session, profile, loading, navigate]);

  // Still resolving auth session
  if (loading) return <PageLoader />;

  // Not authenticated — send to auth page
  if (!session) return <Navigate to="/auth" replace />;

  // Authenticated — render the layout (profile may still be loading in BG,
  // but DashboardLayout handles its own loading state via PageLoader)
  return <DashboardLayout />;
};

// ── App ───────────────────────────────────────────────────────────────────────

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <UIPreferencesProvider>
        <AuthProvider>
          <OrganizationProvider>
            {/* TourProvider: was missing entirely — caused useTour() to throw */}
            <TourProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <Routes>

                    <Route path="/" element={<Navigate to="/dashboard" replace />} />

                    {/* Public routes */}
                    <Route path="/auth"        element={<Auth />} />
                    <Route path="/onboarding"  element={<Onboarding />} />
                    <Route path="/portal/auth" element={<PortalAuth />} />
                    <Route path="/portal"      element={<PortalDashboard />} />

                    {/* Protected routes — all under ProtectedRoutes which renders DashboardLayout */}
                    <Route element={<ProtectedRoutes />}>
                      <Route path="/dashboard"        element={<Dashboard />} />
                      <Route path="/leads"            element={<Leads />} />
                      <Route path="/pipeline"         element={<Pipeline />} />
                      <Route path="/contacts"         element={<Contacts />} />
                      <Route path="/companies"        element={<Companies />} />
                      <Route path="/activities"       element={<Activities />} />
                      <Route path="/meetings"         element={<Meetings />} />
                      <Route path="/templates"        element={<Templates />} />
                      <Route path="/outreach-tasks"   element={<OutreachTasks />} />
                      <Route path="/projects"         element={<Projects />} />
                      <Route path="/sprint-board"     element={<SprintBoard />} />
                      <Route path="/documents"        element={<Documents />} />
                      <Route path="/tickets"          element={<Tickets />} />
                      <Route path="/interns"          element={<Interns />} />
                      <Route path="/time-tracking"    element={<TimeTracking />} />
                      <Route path="/invoices"         element={<Invoices />} />
                      <Route path="/team-performance" element={<TeamPerformance />} />
                      <Route path="/analytics"        element={<Analytics />} />
                      <Route path="/automations"      element={<Automations />} />
                      <Route path="/reports"          element={<Reports />} />
                      <Route path="/settings"         element={<Settings />} />
                      <Route path="/investor"         element={<InvestorDashboard />} />

                      {/* Admin-only routes — wrapped in AdminGuard */}
                      <Route path="/admin/users"           element={<AdminGuard><Users /></AdminGuard>} />
                      <Route path="/admin/audit-logs"      element={<AdminGuard><AuditLogs /></AdminGuard>} />
                      <Route path="/admin/investor-config" element={<AdminGuard><InvestorConfig /></AdminGuard>} />
                      <Route path="/admin/integrations"    element={<AdminGuard><Integrations /></AdminGuard>} />
                    </Route>

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>

                {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
              </TooltipProvider>
            </TourProvider>
          </OrganizationProvider>
        </AuthProvider>
      </UIPreferencesProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;