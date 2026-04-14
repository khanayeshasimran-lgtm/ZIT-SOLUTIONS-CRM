// components/AdminGuard.tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PageLoader } from '@/components/PageLoader';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  // Show loader while session is resolving
  if (loading) return <PageLoader />;

  // Not logged in
  if (!user) return <Navigate to="/auth" replace />;

  // Profile still loading in background — show loader briefly rather than
  // incorrectly redirecting a real admin whose profile hasn't arrived yet
  if (!profile) return <PageLoader />;

  // Profile loaded but not admin
  if (profile.role !== 'admin') return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}