/**
 * DashboardLayout.tsx — Responsive layout, language toggle removed from header
 * (it now lives in the sidebar footer — see AppSidebar.tsx)
 */

import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar } from './AppSidebar';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import { cn } from '@/lib/utils';
import { GlobalSearch } from '@/components/GlobalSearch';
import { useSentryUser } from '@/hooks/useSentryUser';  // ← ADD

export const DashboardLayout = () => {
  const { user, loading } = useAuth();
  const { language } = useUIPreferences();
  useSentryUser();  // ← ADD — tags every error with the logged-in user

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-page)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center">
            <span className="text-xl font-semibold text-[var(--accent)]">Z</span>
          </div>
          <p className="text-sm text-[var(--text-muted)] tracking-wide">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const isRTL = language === 'ar';

  return (
    <div
      className="min-h-screen bg-[var(--bg-page)]"
      style={{ '--sw': '256px' } as React.CSSProperties}
      data-layout-root
    >
      <div className="flex min-h-screen">
        <AppSidebar />

        <main
          className={cn(
            'flex-1 min-w-0 overflow-y-auto overflow-x-hidden',
            'transition-[margin] duration-300',
            !isRTL && 'lg:ml-[var(--sw)]',
            isRTL  && 'lg:mr-[var(--sw)]',
          )}
        >
          <header
            className={cn(
              'sticky top-0 z-20 h-12',
              'bg-[var(--bg-surface)]/90 backdrop-blur-md',
              'flex items-center px-4 gap-3',
              'pl-16 lg:pl-4',
            )}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            <div className="flex-1 flex justify-center">
              <div className="w-full max-w-md">
                <GlobalSearch />
              </div>
            </div>
          </header>

          <div className="px-4 py-0 sm:px-6 lg:px-8 max-w-[1400px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};