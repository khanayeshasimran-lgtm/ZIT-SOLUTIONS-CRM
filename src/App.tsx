import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AdminGuard } from "@/components/AdminGuard";
import { UIPreferencesProvider } from "@/contexts/UIPreferencesContext";
import { PageLoader } from "@/components/PageLoader";

import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Pipeline from "./pages/Pipeline";
import Contacts from "./pages/Contacts";
import Companies from "./pages/Companies";
import Activities from "./pages/Activities";
import Meetings from "./pages/Meetings";
import Templates from "./pages/Templates";
import OutreachTasks from "./pages/OutreachTasks";
import Projects from "./pages/Projects";
import Tickets from "./pages/Tickets";
import Interns from "./pages/Interns";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Users from "@/pages/admin/Users";
import AuditLogs from "@/pages/admin/AuditLogs";
import InvestorDashboard from "@/pages/investor/InvestorDashboard";
import InvestorConfig from "@/pages/admin/InvestorConfig";

const queryClient = new QueryClient();

const ProtectedRoutes = () => {
  const { session, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!session) return <Navigate to="/auth" replace />;
  return <DashboardLayout />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UIPreferencesProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/auth" element={<Auth />} />

              <Route element={<ProtectedRoutes />}>
                <Route path="/dashboard"      element={<Dashboard />} />
                <Route path="/leads"          element={<Leads />} />
                <Route path="/pipeline"       element={<Pipeline />} />
                <Route path="/contacts"       element={<Contacts />} />
                <Route path="/companies"      element={<Companies />} />
                <Route path="/activities"     element={<Activities />} />
                <Route path="/meetings"       element={<Meetings />} />
                <Route path="/templates"      element={<Templates />} />
                <Route path="/outreach-tasks" element={<OutreachTasks />} />
                <Route path="/projects"       element={<Projects />} />
                <Route path="/tickets"        element={<Tickets />} />
                <Route path="/interns"        element={<Interns />} />
                <Route path="/analytics"      element={<Analytics />} />
                <Route path="/settings"       element={<Settings />} />

                <Route path="/investor" element={<InvestorDashboard />} />

                <Route path="/admin/users"           element={<AdminGuard><Users /></AdminGuard>} />
                <Route path="/admin/audit-logs"      element={<AdminGuard><AuditLogs /></AdminGuard>} />
                <Route path="/admin/investor-config" element={<AdminGuard><InvestorConfig /></AdminGuard>} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </UIPreferencesProvider>
  </QueryClientProvider>
);

export default App;