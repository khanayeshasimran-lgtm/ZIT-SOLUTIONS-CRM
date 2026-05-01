import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useServerPagination } from '@/hooks/useServerPagination';
import { useQueryClient } from '@tanstack/react-query';
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/export';
import { ExportDropdown } from '@/components/ExportDropdown';
import { logAudit } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { PageLoader } from '@/components/PageLoader';
import { PaginationControls } from '@/components/PaginationControls';
import { Eye, FileEdit, Trash2, Download, Search, Filter, Activity } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

type AuditLog = {
  id: string; action: string; entity: string; entity_id: string | null;
  created_at: string; user_email: string | null;
};
type ActionFilter = 'ALL' | 'VIEW' | 'CHANGE' | 'DELETE' | 'EXPORT' | 'CREATE' | 'UPDATE';
type SearchMode = 'TEXT' | 'DATE' | 'PRESET';

// ── Helpers ───────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay = 400) {
  const [d, setD] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setD(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return d;
}

const ACTION_CFG: Record<string, { pill: string; icon: React.ElementType }> = {
  VIEW:    { pill: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',             icon: Eye       },
  CREATE:  { pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', icon: Activity  },
  UPDATE:  { pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       icon: FileEdit  },
  CHANGE:  { pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       icon: FileEdit  },
  DELETE:  { pill: 'bg-red-50 text-red-700 ring-1 ring-red-200',             icon: Trash2    },
  EXPORT:  { pill: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',    icon: Download  },
  DEFAULT: { pill: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',      icon: Activity  },
};

function getActionCfg(action: string) {
  const key = Object.keys(ACTION_CFG).find(k => k !== 'DEFAULT' && action.startsWith(k));
  return ACTION_CFG[key ?? 'DEFAULT'];
}

function getEntityColor(entity: string): string {
  const map: Record<string, string> = {
    leads:      'text-indigo-600 bg-indigo-50',
    deals:      'text-emerald-600 bg-emerald-50',
    activities: 'text-violet-600 bg-violet-50',
    projects:   'text-teal-600 bg-teal-50',
    tickets:    'text-red-600 bg-red-50',
    invoices:   'text-amber-600 bg-amber-50',
  };
  const key = Object.keys(map).find(k => entity.toLowerCase().includes(k));
  return map[key ?? ''] ?? 'text-slate-600 bg-slate-50';
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center gap-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xl font-black tabular-nums text-slate-800">{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AuditLogs() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  // ── ALL HOOKS MUST COME BEFORE ANY EARLY RETURNS ──────────────────────────
  // DAY 3 FIX: The original called hooks after early returns — React rules violation.
  // All state and hooks are declared here unconditionally.

  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [searchMode,   setSearchMode]   = useState<SearchMode>('TEXT');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL');
  const [entityFilter, setEntityFilter] = useState('ALL');
  const [search,       setSearch]       = useState('');
  const [fromDate,     setFromDate]     = useState('');
  const [toDate,       setToDate]       = useState('');

  // Entity dropdown options — fetched once separately from paginated logs
  const [uniqueEntities, setUniqueEntities] = useState<string[]>([]);

  const debouncedSearch = useDebounce(search);

  // ── SERVER-SIDE PAGINATED FETCH ───────────────────────────────────────────
  // DAY 3 FIX: Replaced .limit(500) + client-side usePagination with
  // useServerPagination. All filters pushed to Postgres — only the current
  // page travels over the network.
  const {
    data:      paged,
    count:     totalCount,
    page,
    pageSize,
    totalPages,
    hasNext,
    hasPrev,
    isLoading: loading,
    setPage,
    setPageSize,
  } = useServerPagination<AuditLog>({
    queryKey: [
      'audit-logs',
      actionFilter,
      entityFilter,
      debouncedSearch,
      fromDate,
      toDate,
      searchMode,
    ],
    fetcher: async ({ page: p, pageSize: ps }) => {
      const from = (p - 1) * ps;
      const to   = from + ps - 1;

      let q = (supabase as any)
        .from('audit_logs')
        .select('id, action, entity, entity_id, created_at, user_email', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to); // ← server-side range, NO .limit(500)

      if (actionFilter !== 'ALL') {
        q = q.ilike('action', `${actionFilter}%`);
      }
      if (entityFilter !== 'ALL') {
        q = q.ilike('entity', `%${entityFilter}%`);
      }
      if (searchMode === 'TEXT' && debouncedSearch) {
        q = q.or(
          `user_email.ilike.%${debouncedSearch}%,` +
          `action.ilike.%${debouncedSearch}%,` +
          `entity.ilike.%${debouncedSearch}%`,
        );
      }
      if (searchMode !== 'TEXT') {
        if (fromDate) q = q.gte('created_at', `${fromDate}T00:00:00`);
        if (toDate)   q = q.lte('created_at', `${toDate}T23:59:59`);
      }

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);

      const total      = count ?? 0;
      const totalPages = Math.max(1, Math.ceil(total / ps));

      return {
        data:       (data ?? []) as AuditLog[],
        count:      total,
        page:       p,
        pageSize:   ps,
        totalPages,
        hasNext:    p < totalPages,
        hasPrev:    p > 1,
      };
    },
    pageSize: 25,
    enabled:  !!profile && profile.role === 'admin',
  });

  // Use `paged` as `logs` for stat card calculations on the current page
  const logs = paged;

  // ── Fetch distinct entity list for the filter dropdown ────────────────────
  // Runs once (and when profile becomes available) — NOT on every page change
  useEffect(() => {
    if (!profile || profile.role !== 'admin') return;
    (supabase as any)
      .from('audit_logs')
      .select('entity')
.then(({ data }: any) => {
  const entities = [...new Set((data ?? []).map((r: any) => r.entity))]
    .filter((e): e is string => !!e)
    .sort();
  setUniqueEntities(entities);
});
  }, [profile]);

  // ── NOW safe to early-return — all hooks have been called ─────────────────
  if (!profile) return <PageLoader />;
  if (profile.role !== 'admin') {
    return <div className="p-6 text-muted-foreground">Access denied</div>;
  }

  // ── Preset handler ────────────────────────────────────────────────────────
  const applyPreset = (days: 'today' | '7' | '30') => {
    const now = new Date();
    const start = new Date();
    if (days === 'today') {
      start.setHours(0, 0, 0, 0);
    } else {
      start.setDate(now.getDate() - Number(days));
    }
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(now.toISOString().slice(0, 10));
    setSearchMode('DATE');
    setPage(1);
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = async (type: 'csv' | 'excel' | 'pdf') => {
    if (!logs.length) return;
    const rows = logs.map(l => ({
      User:    l.user_email ?? 'System',
      Action:  l.action,
      Entity:  l.entity,
      Details: l.entity_id ?? '',
      Time:    format(new Date(l.created_at), 'yyyy-MM-dd HH:mm:ss'),
    }));
    if (type === 'csv')   exportToCSV('audit_logs', rows);
    if (type === 'excel') exportToExcel('audit_logs', rows);
    if (type === 'pdf')   exportToPDF('audit_logs', rows, {
      title: 'ZIT Solutions – CRM', subtitle: 'Audit Logs Report', exportedBy: user?.email ?? 'System',
    });
    await logAudit({
      userId: user?.id, userEmail: user?.email, action: 'EXPORT',
      entity: 'audit_logs', entityId: `${type.toUpperCase()} (${rows.length} rows)`,
    });
  };

  // ── Stat counts from current page ─────────────────────────────────────────
  const actionCounts = logs.reduce((acc, l) => {
    const key = Object.keys(ACTION_CFG).find(k => k !== 'DEFAULT' && l.action.startsWith(k)) ?? 'OTHER';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── Pagination props ──────────────────────────────────────────────────────
  const paginationProps = {
    page,
    pageSize,
    totalCount,
    totalPages,
    hasPrev,
    hasNext,
    onPageChange:     (p: number) => { setPage(p); setExpanded(null); },
    onPageSizeChange: (s: number) => { setPageSize(s); setPage(1); },
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Audit Logs</h1>
          {/* totalCount now shows the full filtered count from the server */}
          <p className="text-muted-foreground mt-0.5 text-sm">
            {totalCount.toLocaleString()} events
            {fromDate ? ` · from ${fromDate}` : ''}
            {toDate   ? ` to ${toDate}`        : ''}
          </p>
        </div>
        <ExportDropdown disabled={logs.length === 0} onExport={handleExport} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Views"   value={actionCounts.VIEW || 0}   icon={Eye}      color="bg-sky-50 text-sky-600" />
        <StatCard label="Changes" value={(actionCounts.CHANGE || 0) + (actionCounts.UPDATE || 0) + (actionCounts.CREATE || 0)} icon={FileEdit} color="bg-amber-50 text-amber-600" />
        <StatCard label="Deletes" value={actionCounts.DELETE || 0}  icon={Trash2}   color="bg-red-50 text-red-600" />
        <StatCard label="Exports" value={actionCounts.EXPORT || 0}  icon={Download} color="bg-violet-50 text-violet-600" />
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={actionFilter} onValueChange={v => { setActionFilter(v as ActionFilter); setPage(1); }}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All actions</SelectItem>
              <SelectItem value="VIEW">View</SelectItem>
              <SelectItem value="CREATE">Create</SelectItem>
              <SelectItem value="UPDATE">Update</SelectItem>
              <SelectItem value="CHANGE">Change</SelectItem>
              <SelectItem value="DELETE">Delete</SelectItem>
              <SelectItem value="EXPORT">Export</SelectItem>
            </SelectContent>
          </Select>

          <Select value={entityFilter} onValueChange={v => { setEntityFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-44 text-sm">
              <SelectValue placeholder="All entities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All entities</SelectItem>
              {uniqueEntities.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={searchMode} onValueChange={v => { setSearchMode(v as SearchMode); setPage(1); }}>
            <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TEXT">Text search</SelectItem>
              <SelectItem value="DATE">Date range</SelectItem>
              <SelectItem value="PRESET">Quick ranges</SelectItem>
            </SelectContent>
          </Select>

          {searchMode === 'TEXT' && (
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Email / action / entity…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="h-9 pl-8 text-sm"
              />
            </div>
          )}

          {searchMode === 'DATE' && (
            <>
              <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }} className="h-9 w-36 text-sm" />
              <span className="text-muted-foreground">→</span>
              <Input type="date" value={toDate}   onChange={e => { setToDate(e.target.value);   setPage(1); }} className="h-9 w-36 text-sm" />
            </>
          )}

          {searchMode === 'PRESET' && (
            <div className="flex gap-2">
              {[['today','Today'],['7','Last 7d'],['30','Last 30d']].map(([v, l]) => (
                <Button key={v} variant="outline" size="sm" className="h-9" onClick={() => applyPreset(v as any)}>
                  {l}
                </Button>
              ))}
            </div>
          )}

          {(actionFilter !== 'ALL' || entityFilter !== 'ALL' || search || fromDate) && (
            <Button
              variant="ghost" size="sm" className="h-9 text-xs ml-auto"
              onClick={() => {
                setActionFilter('ALL'); setEntityFilter('ALL');
                setSearch(''); setFromDate(''); setToDate('');
                setSearchMode('TEXT'); setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              {['User','Action','Entity','Details','Time'].map(h => (
                <th key={h} className={`p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide ${h === 'Entity' ? 'hidden md:table-cell' : h === 'Details' ? 'hidden lg:table-cell' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && paged.length === 0 && (
              <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">No audit logs found</td></tr>
            )}
            {!loading && paged.flatMap(log => {
              const cfg    = getActionCfg(log.action);
              const Icon   = cfg.icon;
              const isOpen = expanded === log.id;
              return [
                <tr
                  key={log.id}
                  className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : log.id)}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-400 to-violet-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                        {(log.user_email ?? 'S')[0].toUpperCase()}
                      </div>
                      <span className="text-xs text-slate-700 font-medium truncate max-w-[140px]">
                        {log.user_email ?? 'System'}
                      </span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.pill}`}>
                      <Icon className="h-3 w-3" />{log.action}
                    </span>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getEntityColor(log.entity)}`}>
                      {log.entity}
                    </span>
                  </td>
                  <td className="p-3 hidden lg:table-cell">
                    <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px] block">
                      {log.entity_id ?? '—'}
                    </span>
                  </td>
                  <td className="p-3">
                    <p className="text-xs text-slate-600 font-medium">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(log.created_at), 'MMM d, HH:mm')}
                    </p>
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${log.id}-exp`} className="bg-indigo-50/30 border-t border-indigo-100/50">
                    <td colSpan={5} className="px-5 py-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                        <div><p className="text-muted-foreground mb-0.5">User</p><p className="font-medium">{log.user_email ?? 'System'}</p></div>
                        <div><p className="text-muted-foreground mb-0.5">Action</p><p className="font-medium">{log.action}</p></div>
                        <div><p className="text-muted-foreground mb-0.5">Entity</p><p className="font-medium">{log.entity}</p></div>
                        <div><p className="text-muted-foreground mb-0.5">Entity ID</p><p className="font-mono text-[10px] break-all">{log.entity_id ?? '—'}</p></div>
                        <div className="col-span-4">
                          <p className="text-muted-foreground mb-0.5">Full timestamp</p>
                          <p className="font-medium">{format(new Date(log.created_at), 'EEEE, MMMM d yyyy at HH:mm:ss')}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ),
              ].filter(Boolean);
            })}
          </tbody>
        </table>
      </div>

      <PaginationControls {...paginationProps} />
    </div>
  );
}