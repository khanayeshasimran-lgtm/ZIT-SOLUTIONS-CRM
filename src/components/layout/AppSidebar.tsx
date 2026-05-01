/**
 * src/components/layout/AppSidebar.tsx
 */

import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, Building2, UserPlus, Handshake,
  Calendar, CalendarDays, Mail, ListTodo, FolderKanban,
  Ticket, GraduationCap, BarChart3, Settings, LogOut,
  Menu, X, TrendingUp, Search, ChevronLeft, ChevronRight,
  Zap, Hash, Globe, Clock, FileText, Kanban, FolderOpen,
  Plug, BookOpen,
} from 'lucide-react';

/* ── Menu definitions ─────────────────────────────────────────────────────── */

const menuItems = [
  { icon: LayoutDashboard, labelEn: 'Dashboard',       labelAr: 'لوحة التحكم',       path: '/dashboard',       roles: ['admin','manager','user'], shortcut: 'D', color: '#6366f1' },
  { icon: UserPlus,        labelEn: 'Leads',            labelAr: 'العملاء المحتملون', path: '/leads',           roles: ['admin','manager','user'], shortcut: 'L', color: '#0ea5e9' },
  { icon: Handshake,       labelEn: 'Pipeline',         labelAr: 'مسار الصفقات',      path: '/pipeline',        roles: ['admin','manager','user'], shortcut: 'P', color: '#10b981' },
  { icon: Building2,       labelEn: 'Companies',        labelAr: 'الشركات',           path: '/companies',       roles: ['admin','manager','user'], shortcut: 'C', color: '#f59e0b' },
  { icon: Users,           labelEn: 'Contacts',         labelAr: 'جهات الاتصال',      path: '/contacts',        roles: ['admin','manager','user'], shortcut: 'O', color: '#ec4899' },
  { icon: Calendar,        labelEn: 'Activities',       labelAr: 'الأنشطة',           path: '/activities',      roles: ['admin','manager','user'], shortcut: 'A', color: '#8b5cf6' },
  { icon: CalendarDays,    labelEn: 'Meetings',         labelAr: 'الاجتماعات',        path: '/meetings',        roles: ['admin','manager','user'], shortcut: 'M', color: '#06b6d4' },
  { icon: Mail,            labelEn: 'Templates',        labelAr: 'القوالب',           path: '/templates',       roles: ['admin','manager','user'], shortcut: 'T', color: '#f97316' },
  { icon: ListTodo,        labelEn: 'Outreach Tasks',   labelAr: 'مهام المتابعة',     path: '/outreach-tasks',  roles: ['admin','manager','user'], shortcut: 'K', color: '#84cc16' },
  { icon: FolderKanban,    labelEn: 'Projects',         labelAr: 'المشاريع',          path: '/projects',        roles: ['admin','manager','user'], shortcut: 'J', color: '#14b8a6' },
  { icon: Kanban,          labelEn: 'Sprint Board',     labelAr: 'لوحة السبرينت',     path: '/sprint-board',    roles: ['admin','manager','user'], shortcut: 'B', color: '#6366f1' },
  { icon: FolderOpen,      labelEn: 'Documents',        labelAr: 'المستندات',         path: '/documents',       roles: ['admin','manager','user'], shortcut: 'G', color: '#0ea5e9' },
  { icon: Clock,           labelEn: 'Time Tracking',    labelAr: 'تتبع الوقت',        path: '/time-tracking',   roles: ['admin','manager','user'], shortcut: 'H', color: '#f43f5e' },
  { icon: FileText,        labelEn: 'Invoices',         labelAr: 'الفواتير',          path: '/invoices',        roles: ['admin','manager'],       shortcut: 'V', color: '#0d9488' },
  { icon: Zap,             labelEn: 'Automations',      labelAr: 'الأتمتة',           path: '/automations',     roles: ['admin','manager'],       shortcut: 'Z', color: '#6366f1' },
  { icon: Ticket,          labelEn: 'Tickets',          labelAr: 'الدعم',             path: '/tickets',         roles: ['admin','manager','user'], shortcut: 'I', color: '#e11d48' },
  { icon: GraduationCap,   labelEn: 'Interns',          labelAr: 'التدريب',           path: '/interns',         roles: ['admin','manager','user'], shortcut: 'N', color: '#a78bfa' },
  { icon: BarChart3,       labelEn: 'Analytics',        labelAr: 'التحليلات',         path: '/analytics',       roles: ['admin','manager','user'], shortcut: 'Y', color: '#34d399' },
  { icon: BookOpen,        labelEn: 'Reports',          labelAr: 'التقارير',          path: '/reports',         roles: ['admin','manager'],       shortcut: 'R', color: '#f59e0b' },
  { icon: Users,           labelEn: 'Team Performance', labelAr: 'أداء الفريق',       path: '/team-performance',roles: ['admin','manager'],       shortcut: 'Q', color: '#818cf8' },
  { icon: Settings,        labelEn: 'Settings',         labelAr: 'الإعدادات',         path: '/settings',        roles: ['admin','manager','user'], shortcut: 'S', color: '#94a3b8' },
];

const adminMenuItems = [
  { icon: Users,      labelEn: 'Users',            labelAr: 'المستخدمون',     path: '/admin/users',           color: '#60a5fa' },
  { icon: BarChart3,  labelEn: 'Audit Logs',       labelAr: 'سجلات التدقيق', path: '/admin/audit-logs',      color: '#a78bfa' },
  { icon: TrendingUp, labelEn: 'Investor Config',  labelAr: 'إعداد المستثمر', path: '/admin/investor-config', color: '#34d399' },
  { icon: Plug,       labelEn: 'Integrations',     labelAr: 'التكاملات',      path: '/admin/integrations',    color: '#6366f1' },
];

const investorMenuItems = [
  { icon: TrendingUp, labelEn: 'Investor Dashboard', labelAr: 'لوحة المستثمر', path: '/investor',  color: '#10b981' },
  { icon: Settings,   labelEn: 'Settings',            labelAr: 'الإعدادات',     path: '/settings',  color: '#94a3b8' },
];

/* ── Sidebar ──────────────────────────────────────────────────────────────── */

export const AppSidebar = () => {
  const { user, profile, loading, signOut } = useAuth();
  const { language, setLanguage } = useUIPreferences();
  const location  = useLocation();
  const navigate  = useNavigate();
  const [isOpen,        setIsOpen]        = useState(false);
  const [collapsed,     setCollapsed]     = useState(false);
  const [search,        setSearch]        = useState('');
  const [searchOpen,    setSearchOpen]    = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const isRTL      = language === 'ar';
  const role       = profile?.role ?? 'user';
  const isAdmin    = role === 'admin';
  const isInvestor = role === 'investor';
  const initials   = (profile?.full_name || user?.email || 'U')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  useEffect(() => {
    const root = document.querySelector('[data-layout-root]') as HTMLElement;
    if (root) root.style.setProperty('--sw', collapsed ? '68px' : '256px');
  }, [collapsed]);

  useEffect(() => { setIsOpen(false); }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setCollapsed(false);
        setTimeout(() => searchRef.current?.focus(), 100);
      }
      if (e.key === 'Escape') { setSearchOpen(false); setSearch(''); }
      if (e.key === '?' && !['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        setShowShortcuts(v => !v);
      }
      if (!['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const item = menuItems.find(i => i.shortcut === e.key.toUpperCase() && i.roles.includes(role));
        if (item) navigate(item.path);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [role, navigate]);

  if (loading || !user) return null;

  const allNavItems   = isInvestor ? investorMenuItems : menuItems.filter(i => i.roles.includes(role));
  const filteredItems = search
    ? allNavItems.filter(i => i.labelEn.toLowerCase().includes(search.toLowerCase()))
    : allNavItems;

  const sidebarWidth = collapsed ? 'w-[68px]' : 'w-64';

  const NavItem = ({ item, isActive }: { item: typeof menuItems[0]; isActive: boolean }) => (
    <>
      {isActive && (
        <span
          className={cn('absolute top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full', isRTL ? 'right-0' : 'left-0')}
          style={{ backgroundColor: item.color, boxShadow: `0 0 8px ${item.color}80` }}
        />
      )}
      <item.icon
        className="h-4 w-4 shrink-0"
        style={isActive ? { color: item.color, filter: `drop-shadow(0 0 6px ${item.color}60)` } : {}}
      />
      {!collapsed && (
        <>
          <span className="text-sm font-medium flex-1 truncate whitespace-nowrap">
            {isRTL ? (item as any).labelAr : item.labelEn}
          </span>
          {'shortcut' in item && (
            <kbd className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/30">
              {(item as any).shortcut}
            </kbd>
          )}
        </>
      )}
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle navigation"
        className={cn(
          'lg:hidden fixed top-3 z-50 p-2.5 rounded-xl shadow-lg',
          'bg-[#0f172a] text-white border border-white/10',
          isRTL ? 'right-3' : 'left-3',
        )}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ── SIDEBAR ── */}
      <aside
        dir={isRTL ? 'rtl' : 'ltr'}
        className={cn(
          'fixed inset-y-0 z-40 flex flex-col',
          'border-r border-white/[0.06]',
          'transition-all duration-300 ease-in-out',
          sidebarWidth,
          isRTL ? 'right-0 border-r-0 border-l border-white/[0.06]' : 'left-0',
          isOpen ? 'translate-x-0' : isRTL ? 'translate-x-full' : '-translate-x-full',
          'lg:translate-x-0',
        )}
        style={{ background: 'linear-gradient(180deg, #080d1a 0%, #0b1020 60%, #080d1a 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* ── LOGO ── */}
        <div className={cn(
          'relative flex items-center border-b border-white/[0.06] py-4',
          collapsed ? 'px-3 justify-center' : 'px-4 gap-3',
        )}>
          <div className="shrink-0 h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Zap className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white leading-none">Z IT Solutions</p>
              <p className="text-[10px] text-white/30 mt-0.5 tracking-widest uppercase">CRM</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="shrink-0 hidden lg:flex p-1 rounded-md text-white/20 hover:text-white/60 hover:bg-white/[0.05] transition-all"
              title="Collapse sidebar"
            >
              {isRTL ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </button>
          )}
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="absolute -right-3 top-1/2 -translate-y-1/2 hidden lg:flex h-6 w-6 items-center justify-center rounded-full bg-[#1e293b] border border-white/10 text-white/40 hover:text-white/80 shadow-md transition-all z-10"
              title="Expand sidebar"
            >
              {isRTL ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
        </div>

        {/* ── SEARCH ── */}
        {!collapsed && (
          <div className="px-3 pt-3 pb-1">
            <button
              onClick={() => { setSearchOpen(v => !v); setTimeout(() => searchRef.current?.focus(), 50); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/30 hover:text-white/60 hover:bg-white/[0.07] transition-all text-xs"
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10">⌘K</kbd>
            </button>
            {searchOpen && (
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Type to filter…"
                className="mt-2 w-full px-3 py-2 rounded-lg bg-white/[0.06] border border-white/10 text-white text-xs placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
              />
            )}
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center pt-3 pb-1">
            <button
              onClick={() => { setCollapsed(false); setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 200); }}
              className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all"
              title="Search"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── NAV ── */}
        <nav
          className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 scrollbar-none"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <ul className="space-y-0.5">
            {filteredItems.map(item => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  title={collapsed ? item.labelEn : undefined}
                  className={({ isActive }) => cn(
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150',
                    collapsed && 'justify-center px-2',
                    isRTL && !collapsed && 'flex-row-reverse',
                    isActive
                      ? 'bg-white/[0.08] text-white'
                      : 'text-white/45 hover:bg-white/[0.05] hover:text-white/75',
                  )}
                >
                  {({ isActive }) => <NavItem item={item as any} isActive={isActive} />}
                </NavLink>
              </li>
            ))}

            {/* Admin section */}
            {isAdmin && !isInvestor && (
              <>
                <li>
                  <div className={cn('mt-4 mb-1.5 flex items-center gap-2', collapsed ? 'justify-center px-2' : 'px-3')}>
                    {!collapsed && <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">Admin</span>}
                    {collapsed && <div className="h-px w-6 bg-white/10" />}
                  </div>
                </li>
                {adminMenuItems.map(item => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      title={collapsed ? item.labelEn : undefined}
                      className={({ isActive }) => cn(
                        'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150',
                        collapsed && 'justify-center px-2',
                        isRTL && !collapsed && 'flex-row-reverse',
                        isActive
                          ? 'bg-white/[0.08] text-white'
                          : 'text-white/45 hover:bg-white/[0.05] hover:text-white/75',
                      )}
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span
                              className={cn('absolute top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full', isRTL ? 'right-0' : 'left-0')}
                              style={{ backgroundColor: item.color, boxShadow: `0 0 8px ${item.color}80` }}
                            />
                          )}
                          <item.icon
                            className="h-4 w-4 shrink-0"
                            style={isActive ? { color: item.color, filter: `drop-shadow(0 0 6px ${item.color}60)` } : {}}
                          />
                          {!collapsed && (
                            <span className="text-sm font-medium flex-1 truncate">
                              {isRTL ? item.labelAr : item.labelEn}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </>
            )}
          </ul>
        </nav>

        {/* ── FOOTER ── */}
        <div className="border-t border-white/[0.06] p-2 space-y-1">
          <button
            onClick={() => setLanguage(isRTL ? 'en' : 'ar')}
            title={collapsed ? (isRTL ? 'Switch to English' : 'التبديل إلى العربية') : undefined}
            className={cn(
              'w-full flex items-center rounded-lg px-3 py-2 transition-all text-xs',
              'text-white/35 hover:text-white/65 hover:bg-white/[0.05]',
              collapsed ? 'justify-center px-2' : 'gap-2.5',
            )}
          >
            <Globe className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">{isRTL ? 'English' : 'العربية'}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 font-mono">
                  {isRTL ? 'EN' : 'AR'}
                </span>
              </>
            )}
          </button>

          {!collapsed && (
            <button
              onClick={() => setShowShortcuts(v => !v)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all text-xs"
            >
              <Hash className="h-3.5 w-3.5 shrink-0" />
              <span>Keyboard shortcuts</span>
              <kbd className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10">?</kbd>
            </button>
          )}

          <div className={cn(
            'flex items-center rounded-lg px-2 py-2 gap-3 transition-all',
            collapsed ? 'justify-center flex-col' : '',
            isRTL && !collapsed ? 'flex-row-reverse' : '',
          )}>
            <div className="shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center text-white text-[11px] font-bold shadow-md">
              {initials}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white/80 truncate">
                    {profile?.full_name || user?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-[10px] text-white/30 capitalize">{role}</p>
                </div>
                <button
                  onClick={signOut}
                  title="Sign out"
                  className="shrink-0 p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
            {collapsed && (
              <button
                onClick={signOut}
                title="Sign out"
                className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── KEYBOARD SHORTCUTS MODAL ── */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#0f172a] border border-white/10 shadow-2xl p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-white/40 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50">Open search</span>
                <div className="flex gap-1">
                  <kbd className="px-2 py-1 rounded bg-white/10 text-white/60 font-mono">⌘</kbd>
                  <kbd className="px-2 py-1 rounded bg-white/10 text-white/60 font-mono">K</kbd>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50">Show shortcuts</span>
                <kbd className="px-2 py-1 rounded bg-white/10 text-white/60 font-mono">?</kbd>
              </div>
              <div className="h-px bg-white/10 my-2" />
              {menuItems.filter(i => i.roles.includes(role) && 'shortcut' in i).map(item => (
                <div key={item.path} className="flex items-center justify-between text-xs">
                  <span className="text-white/50 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.labelEn}
                  </span>
                  <kbd className="px-2 py-1 rounded bg-white/10 text-white/60 font-mono">{item.shortcut}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};