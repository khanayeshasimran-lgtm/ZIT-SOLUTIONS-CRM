// src/App.tsx
// KEY CHANGE: No forced onboarding redirect. New signups see PendingAccess screen
// with a choice: "I'm staff" → /onboarding | "I'm a client" → /portal/auth

import { Toaster }             from '@/components/ui/toaster';
import { Toaster as Sonner }   from '@/components/ui/sonner';
import { TooltipProvider }     from '@/components/ui/tooltip';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools }  from '@tanstack/react-query-devtools';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth }         from '@/contexts/AuthContext';
import { OrganizationProvider }          from '@/contexts/OrganizationContext';
import { TourProvider }                  from '@/contexts/TourContext';
import { UIPreferencesProvider }         from '@/contexts/UIPreferencesContext';
import { DashboardLayout }               from '@/components/layout/DashboardLayout';
import { AdminGuard }                    from '@/components/AdminGuard';
import { PageLoader }                    from '@/components/PageLoader';
import { ErrorBoundary }                 from '@/lib/errorBoundary';
import { queryClient }                   from '@/lib/queryClient';
import { Building2, LogIn, Zap, ArrowRight, LogOut } from 'lucide-react';

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

// Shown to logged-in users with no org yet — lets them choose their path
function PendingAccess() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <div className="relative w-full max-w-md space-y-8">
        <div className="flex items-center justify-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="text-white font-bold text-xl">Z IT Solutions CRM</span>
        </div>

        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="text-center">
            <p className="text-white/50 text-sm">Signed in as</p>
            <p className="text-white font-medium mt-0.5">{user?.email}</p>
          </div>

          <div className="h-px bg-white/[0.08]" />

          <div className="text-center space-y-1">
            <p className="text-lg font-bold text-white">What would you like to do?</p>
            <p className="text-white/50 text-sm">Choose how you want to access the platform.</p>
          </div>

          <button
            onClick={() => navigate('/onboarding')}
            className="w-full group flex items-center gap-4 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 hover:border-indigo-500/60 rounded-xl p-4 transition-all text-left"
          >
            <div className="h-10 w-10 rounded-lg bg-indigo-600/40 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-indigo-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">I'm a staff member</p>
              <p className="text-white/50 text-xs mt-0.5">Create or join a workspace to access the CRM</p>
            </div>
            <ArrowRight className="h-4 w-4 text-white/40 group-hover:text-white/70 shrink-0 transition-colors" />
          </button>

          <button
            onClick={() => navigate('/portal/auth')}
            className="w-full group flex items-center gap-4 bg-teal-600/10 hover:bg-teal-600/20 border border-teal-500/20 hover:border-teal-500/40 rounded-xl p-4 transition-all text-left"
          >
            <div className="h-10 w-10 rounded-lg bg-teal-600/30 flex items-center justify-center shrink-0">
              <LogIn className="h-5 w-5 text-teal-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">I'm a client</p>
              <p className="text-white/50 text-xs mt-0.5">Access the client portal instead</p>
            </div>
            <ArrowRight className="h-4 w-4 text-white/40 group-hover:text-white/70 shrink-0 transition-colors" />
          </button>

          <div className="h-px bg-white/[0.08]" />

          <button
            onClick={async () => { await signOut(); navigate('/auth', { replace: true }); }}
            className="flex items-center gap-1.5 text-sm text-white/30 hover:text-red-400 transition-colors mx-auto"
          >
            <LogOut className="h-3.5 w-3.5" />Sign out
          </button>
        </div>

        <p className="text-center text-white/20 text-xs">
          Invited by your admin? Choose "I'm a staff member" and enter your invite code.
        </p>
      </div>
    </div>
  );
}

const PortalGuard = () => {
  const { session, profile, loading } = useAuth();
  if (loading)  return <PageLoader />;
  if (!session) return <Navigate to="/portal/auth" replace />;
  if (!profile) return <PageLoader />;
  if (profile.role !== 'client') return <Navigate to="/dashboard" replace />;
  return <PortalDashboard />;
};

const OnboardingGuard = () => {
  const { session, profile, loading } = useAuth();
  if (loading)  return <PageLoader />;
  if (!session) return <Navigate to="/auth" replace />;
  if (!profile) return <PageLoader />;
  if (profile.role === 'client')  return <Navigate to="/portal" replace />;
  if (profile.organization_id)    return <Navigate to="/dashboard" replace />;
  return <Onboarding />;
};

const ProtectedRoutes = () => {
  const { session, profile, loading } = useAuth();
  if (loading)  return <PageLoader />;
  if (!session) return <Navigate to="/auth" replace />;
  if (!profile) return <PageLoader />;
  if (profile.role === 'client')    return <Navigate to="/portal" replace />;
  if (!profile.organization_id)     return <PendingAccess />;
  return <DashboardLayout />;
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <UIPreferencesProvider>
        <AuthProvider>
          <OrganizationProvider>
            <TourProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/auth"        element={<Auth />} />
                    <Route path="/portal/auth" element={<PortalAuth />} />
                    <Route path="/portal"      element={<PortalGuard />} />
                    <Route path="/onboarding"  element={<OnboardingGuard />} />

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