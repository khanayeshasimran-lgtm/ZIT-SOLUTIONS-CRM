/**
 * DashboardLayout.tsx — Responsive layout, language toggle removed from header
 * (it now lives in the sidebar footer — see AppSidebar.tsx)
 *
 * Key points:
 * 1. Sidebar collapse properly shifts main content via CSS var --sw
 * 2. Content fills available space — no empty gap when sidebar collapses
 * 3. RTL-aware
 * 4. Clean, minimal header — just the mobile hamburger spacer + page-level actions slot
 */

import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar } from './AppSidebar';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import { cn } from '@/lib/utils';

export const DashboardLayout = () => {
  const { user, loading } = useAuth();
  const { language } = useUIPreferences();

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
    /*
     * --sw is toggled by AppSidebar on [data-layout-root].
     * Full: 256px  |  Collapsed: 68px
     * The <main> uses margin-[left|right]: var(--sw) so it always fills
     * the remaining space exactly — no gap, no overlap.
     */
    <div
      className="min-h-screen bg-[var(--bg-page)]"
      style={{ '--sw': '256px' } as React.CSSProperties}
      data-layout-root
    >
      {/* ── BODY ── */}
      <div className="flex min-h-screen">
        <AppSidebar />

        {/*
         * On desktop: left/right margin = sidebar width (var(--sw))
         * AppSidebar updates --sw on collapse so this margin tracks it.
         * On mobile: no margin (sidebar overlays the content).
         */}
        <main
          className={cn(
            'flex-1 min-w-0 overflow-y-auto overflow-x-hidden',
            'transition-[margin] duration-300',
          )}
          style={{
            marginLeft:  isRTL ? undefined : 'var(--sw)',
            marginRight: isRTL ? 'var(--sw)' : undefined,
          }}
        >
          {/* Sticky top bar — mobile hamburger offset + optional breadcrumb/actions area */}
          <header
  className={cn(
    'sticky top-0 z-20 h-12',
              'bg-[var(--bg-surface)]/90 backdrop-blur-md',
              'flex items-center px-4 gap-3',
              // On mobile, leave room for the floating hamburger button
              'pl-16 lg:pl-4',
            )}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            {/*
             * This header is intentionally minimal.
             * Each page can render its own actions (Add, Export, Import, etc.)
             * inside the page content — not crammed into a global header.
             * The language toggle is in the sidebar footer.
             */}
            <div className="flex-1" />
          </header>

          {/* Page content */}
          <div className="px-4 py-0 sm:px-6 lg:px-8 max-w-[1400px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};