/**
 * src/pages/Reports.tsx
 *
 * Custom Report Builder — Tier 2, Item 9
 *
 * Features:
 *   - Pick entity (Leads, Deals, Activities, Tickets, Invoices, Contacts)
 *   - Pick columns to include
 *   - Add filters (status, date range, assigned to, etc.)
 *   - Pick chart type (bar, pie, line) + group-by field
 *   - Live data table preview
 *   - Export to CSV, Excel, PDF
 *   - Save/load named reports (per-user, via saved_filters table)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/export';
import { PageLoader } from '@/components/PageLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  FileText, BarChart2, PieChart as PieIcon, TrendingUp,
  Plus, Trash2, Save, Download, Play, X, ChevronDown,
  ChevronUp, BookOpen, RefreshCw, FileSpreadsheet, Filter,
  Check, Columns,
} from 'lucide-react';
import { format } from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────────────────

type EntityType = 'leads' | 'deals' | 'activities' | 'tickets' | 'invoices' | 'contacts';
type ChartType  = 'bar' | 'pie' | 'line' | 'none';

interface ColumnDef {
  key:   string;
  label: string;
  type:  'text' | 'number' | 'date' | 'status' | 'currency';
}

interface FilterDef {
  column:   string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'like' | 'is';
  value:    string;
}

interface ReportConfig {
  entity:      EntityType;
  columns:     string[];
  filters:     FilterDef[];
  chartType:   ChartType;
  groupBy:     string;
  sortBy:      string;
  sortDir:     'asc' | 'desc';
  limit:       number;
}

interface SavedReport {
  id:      string;
  name:    string;
  filters: ReportConfig;
}

// ── Entity definitions ────────────────────────────────────────────────────────

const ENTITIES: Record<EntityType, {
  label:   string;
  table:   string;
  color:   string;
  columns: ColumnDef[];
}> = {
  leads: {
    label: 'Leads', table: 'leads', color: '#6366f1',
    columns: [
      { key: 'name',              label: 'Name',           type: 'text'     },
      { key: 'email',             label: 'Email',          type: 'text'     },
      { key: 'phone',             label: 'Phone',          type: 'text'     },
      { key: 'status',            label: 'Status',         type: 'status'   },
      { key: 'source',            label: 'Source',         type: 'text'     },
      { key: 'priority',          label: 'Priority',       type: 'status'   },
      { key: 'ai_score',          label: 'AI Score',       type: 'number'   },
      { key: 'last_contacted_at', label: 'Last Contacted', type: 'date'     },
      { key: 'created_at',        label: 'Created At',     type: 'date'     },
    ],
  },
  deals: {
    label: 'Deals', table: 'deals', color: '#10b981',
    columns: [
      { key: 'title',               label: 'Title',              type: 'text'     },
      { key: 'stage',               label: 'Stage',              type: 'status'   },
      { key: 'value',               label: 'Value',              type: 'currency' },
      { key: 'probability',         label: 'Probability %',      type: 'number'   },
      { key: 'expected_close_date', label: 'Expected Close',     type: 'date'     },
      { key: 'created_at',          label: 'Created At',         type: 'date'     },
    ],
  },
  activities: {
    label: 'Activities', table: 'activities', color: '#8b5cf6',
    columns: [
      { key: 'title',       label: 'Title',       type: 'text'   },
      { key: 'type',        label: 'Type',        type: 'status' },
      { key: 'status',      label: 'Status',      type: 'status' },
      { key: 'due_date',    label: 'Due Date',    type: 'date'   },
      { key: 'created_at',  label: 'Created At',  type: 'date'   },
    ],
  },
  tickets: {
    label: 'Tickets', table: 'tickets', color: '#e11d48',
    columns: [
      { key: 'title',             label: 'Title',       type: 'text'   },
      { key: 'status',            label: 'Status',      type: 'status' },
      { key: 'priority',          label: 'Priority',    type: 'status' },
      { key: 'category',          label: 'Category',    type: 'text'   },
      { key: 'assigned_to_email', label: 'Assigned To', type: 'text'   },
      { key: 'created_at',        label: 'Created At',  type: 'date'   },
    ],
  },
  invoices: {
    label: 'Invoices', table: 'invoices', color: '#0d9488',
    columns: [
      { key: 'invoice_number', label: 'Invoice #',  type: 'text'     },
      { key: 'status',         label: 'Status',     type: 'status'   },
      { key: 'subtotal',       label: 'Subtotal',   type: 'currency' },
      { key: 'tax_amount',     label: 'Tax',        type: 'currency' },
      { key: 'total',          label: 'Total',      type: 'currency' },
      { key: 'currency',       label: 'Currency',   type: 'text'     },
      { key: 'due_date',       label: 'Due Date',   type: 'date'     },
      { key: 'paid_at',        label: 'Paid At',    type: 'date'     },
      { key: 'created_at',     label: 'Created At', type: 'date'     },
    ],
  },
  contacts: {
    label: 'Contacts', table: 'contacts', color: '#ec4899',
    columns: [
      { key: 'first_name', label: 'First Name', type: 'text' },
      { key: 'last_name',  label: 'Last Name',  type: 'text' },
      { key: 'email',      label: 'Email',      type: 'text' },
      { key: 'phone',      label: 'Phone',      type: 'text' },
      { key: 'position',   label: 'Position',   type: 'text' },
      { key: 'created_at', label: 'Created At', type: 'date' },
    ],
  },
};

const COLORS = ['#6366f1','#10b981','#f59e0b','#e11d48','#0ea5e9','#8b5cf6','#f97316','#14b8a6'];

const OPERATORS = [
  { value: 'eq',   label: '='         },
  { value: 'neq',  label: '≠'         },
  { value: 'gt',   label: '>'         },
  { value: 'lt',   label: '<'         },
  { value: 'gte',  label: '>='        },
  { value: 'lte',  label: '<='        },
  { value: 'like', label: 'contains'  },
  { value: 'is',   label: 'is null'   },
];

const DEFAULT_CONFIG: ReportConfig = {
  entity:    'leads',
  columns:   ['name', 'email', 'status', 'source', 'created_at'],
  filters:   [],
  chartType: 'bar',
  groupBy:   'status',
  sortBy:    'created_at',
  sortDir:   'desc',
  limit:     100,
};

const chartStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '8px 12px',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCell(value: unknown, type: ColumnDef['type']): string {
  if (value === null || value === undefined) return '—';
  if (type === 'date')     return value ? format(new Date(String(value)), 'MMM d, yyyy') : '—';
  if (type === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(Number(value));
  if (type === 'number')   return String(Number(value).toLocaleString());
  return String(value);
}

function buildChartData(rows: any[], groupBy: string): { name: string; value: number }[] {
  const map: Record<string, number> = {};
  rows.forEach(row => {
    const key = String(row[groupBy] ?? 'Unknown');
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
}

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  new:                'bg-indigo-50 text-indigo-700',
  contacted:          'bg-sky-50 text-sky-700',
  qualified:          'bg-emerald-50 text-emerald-700',
  unqualified:        'bg-slate-100 text-slate-500',
  won:                'bg-emerald-50 text-emerald-700',
  lost:               'bg-red-50 text-red-600',
  new_lead:           'bg-indigo-50 text-indigo-700',
  proposal:           'bg-violet-50 text-violet-700',
  negotiation:        'bg-amber-50 text-amber-700',
  scheduled:          'bg-blue-50 text-blue-700',
  completed:          'bg-emerald-50 text-emerald-700',
  cancelled:          'bg-slate-100 text-slate-500',
  open:               'bg-indigo-50 text-indigo-700',
  in_progress:        'bg-amber-50 text-amber-700',
  resolved:           'bg-emerald-50 text-emerald-700',
  closed:             'bg-slate-100 text-slate-500',
  draft:              'bg-slate-100 text-slate-500',
  sent:               'bg-blue-50 text-blue-700',
  paid:               'bg-emerald-50 text-emerald-700',
  overdue:            'bg-red-50 text-red-600',
  low:                'bg-slate-100 text-slate-500',
  medium:             'bg-sky-50 text-sky-700',
  high:               'bg-amber-50 text-amber-700',
  urgent:             'bg-red-50 text-red-600',
  call:               'bg-blue-50 text-blue-700',
  meeting:            'bg-violet-50 text-violet-700',
  follow_up:          'bg-amber-50 text-amber-700',
  email:              'bg-indigo-50 text-indigo-700',
  meeting_scheduled:  'bg-teal-50 text-teal-700',
};

function StatusPill({ value }: { value: string }) {
  const cls = STATUS_COLORS[value] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Reports() {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [config,       setConfig]       = useState<ReportConfig>(DEFAULT_CONFIG);
  const [data,         setData]         = useState<any[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [hasRun,       setHasRun]       = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [reportName,   setReportName]   = useState('');
  const [showFilters,  setShowFilters]  = useState(true);
  const [showColumns,  setShowColumns]  = useState(false);

  const entityCfg = ENTITIES[config.entity];

  // ── Load saved reports ─────────────────────────────────────────────────────

  const loadSaved = useCallback(async () => {
    if (!user) return;
    const { data: rows } = await (supabase as any)
      .from('saved_filters')
      .select('id, name, filters')
      .eq('user_id', user.id)
      .eq('entity', 'report')
      .order('created_at', { ascending: false });
    setSavedReports((rows ?? []).map((r: any) => ({
      id:      r.id,
      name:    r.name,
      filters: r.filters as ReportConfig,
    })));
  }, [user]);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  // ── Run report ─────────────────────────────────────────────────────────────

  const runReport = async () => {
    setLoading(true);
    try {
      let q = (supabase as any)
        .from(entityCfg.table)
        .select('*')
        .order(config.sortBy || 'created_at', { ascending: config.sortDir === 'asc' })
        .limit(config.limit);

      // Apply filters
      for (const f of config.filters) {
        if (!f.column || !f.value && f.operator !== 'is') continue;
        if (f.operator === 'like') {
          q = q.ilike(f.column, `%${f.value}%`);
        } else if (f.operator === 'is') {
          q = q.is(f.column, null);
        } else {
          q = q[f.operator](f.column, f.value);
        }
      }

      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      setData(rows ?? []);
      setHasRun(true);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Report failed', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ── Save report ────────────────────────────────────────────────────────────

  const saveReport = async () => {
    if (!reportName.trim() || !user) return;
    const { error } = await (supabase as any).from('saved_filters').insert({
      user_id: user.id,
      name:    reportName.trim(),
      entity:  'report',
      filters: config,
    });
    if (error) { toast({ variant: 'destructive', title: 'Save failed', description: error.message }); return; }
    toast({ title: 'Report saved ✓' });
    setSaveDialogOpen(false);
    setReportName('');
    loadSaved();
  };

  const deleteReport = async (id: string) => {
    await (supabase as any).from('saved_filters').delete().eq('id', id);
    setSavedReports(s => s.filter(r => r.id !== id));
    toast({ title: 'Report deleted' });
  };

  // ── Export ────────────────────────────────────────────────────────────────

  const getExportRows = () => {
    const cols = config.columns.length ? config.columns : entityCfg.columns.map(c => c.key);
    return data.map(row => {
      const out: Record<string, string> = {};
      cols.forEach(key => {
        const col = entityCfg.columns.find(c => c.key === key);
        out[col?.label ?? key] = formatCell(row[key], col?.type ?? 'text');
      });
      return out;
    });
  };

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    const rows = getExportRows();
    if (!rows.length) { toast({ variant: 'destructive', title: 'No data to export' }); return; }
    const filename = `report_${config.entity}_${format(new Date(), 'yyyy-MM-dd')}`;
    if (type === 'csv')   exportToCSV(filename, rows);
    if (type === 'excel') exportToExcel(filename, rows);
    if (type === 'pdf')   exportToPDF(filename, rows, {
      title:      'Z IT Solutions CRM',
      subtitle:   `${entityCfg.label} Report`,
      exportedBy: (profile as any)?.email ?? user?.email ?? 'System',
    });
    logAudit({ userId: user?.id, userEmail: (profile as any)?.email ?? user?.email, action: 'EXPORT', entity: 'report', entityId: `${config.entity} ${type.toUpperCase()} (${rows.length} rows)` });
  };

  // ── Filter helpers ────────────────────────────────────────────────────────

  const addFilter = () => setConfig(c => ({
    ...c, filters: [...c.filters, { column: entityCfg.columns[0].key, operator: 'eq', value: '' }],
  }));

  const updateFilter = (i: number, patch: Partial<FilterDef>) =>
    setConfig(c => ({ ...c, filters: c.filters.map((f, idx) => idx === i ? { ...f, ...patch } : f) }));

  const removeFilter = (i: number) =>
    setConfig(c => ({ ...c, filters: c.filters.filter((_, idx) => idx !== i) }));

  // ── Column toggle ─────────────────────────────────────────────────────────

  const toggleColumn = (key: string) => {
    setConfig(c => ({
      ...c,
      columns: c.columns.includes(key)
        ? c.columns.filter(k => k !== key)
        : [...c.columns, key],
    }));
  };

  // ── Chart data ────────────────────────────────────────────────────────────

  const chartData = useMemo(() =>
    hasRun && config.groupBy ? buildChartData(data, config.groupBy) : [],
    [data, config.groupBy, hasRun]
  );

  const visibleCols = config.columns.length
    ? entityCfg.columns.filter(c => config.columns.includes(c.key))
    : entityCfg.columns;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="h-6 w-6 text-indigo-500" />
            Report Builder
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Build, filter, visualise and export custom reports across all your data
          </p>
        </div>

        {/* Saved reports */}
        {savedReports.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">Saved:</span>
            {savedReports.map(r => (
              <div key={r.id} className="flex items-center gap-1">
                <button
                  onClick={() => { setConfig(r.filters); setHasRun(false); }}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-indigo-300 hover:text-indigo-600 transition-all font-medium"
                >
                  <BookOpen className="h-3 w-3" />
                  {r.name}
                </button>
                <button
                  onClick={() => deleteReport(r.id)}
                  className="p-1 text-slate-300 hover:text-red-400 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Config panel ── */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-[0_1px_6px_rgba(0,0,0,0.04)] overflow-hidden">

        {/* Entity + core settings row */}
        <div className="p-5 border-b border-slate-100">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">

            {/* Entity picker */}
            <div className="space-y-1 col-span-2 sm:col-span-1">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Data source</Label>
              <Select
                value={config.entity}
                onValueChange={v => setConfig({
                  ...DEFAULT_CONFIG,
                  entity:  v as EntityType,
                  columns: ENTITIES[v as EntityType].columns.slice(0, 5).map(c => c.key),
                  groupBy: ENTITIES[v as EntityType].columns.find(c => c.type === 'status')?.key ?? ENTITIES[v as EntityType].columns[0].key,
                  sortBy:  'created_at',
                })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(ENTITIES) as [EntityType, typeof ENTITIES[EntityType]][]).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                        {cfg.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Chart type */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Chart</Label>
              <Select value={config.chartType} onValueChange={v => setConfig(c => ({ ...c, chartType: v as ChartType }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar"><div className="flex items-center gap-2"><BarChart2 className="h-3.5 w-3.5" />Bar</div></SelectItem>
                  <SelectItem value="pie"><div className="flex items-center gap-2"><PieIcon className="h-3.5 w-3.5" />Pie</div></SelectItem>
                  <SelectItem value="line"><div className="flex items-center gap-2"><TrendingUp className="h-3.5 w-3.5" />Line</div></SelectItem>
                  <SelectItem value="none"><div className="flex items-center gap-2"><X className="h-3.5 w-3.5" />None</div></SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Group by */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Group by</Label>
              <Select value={config.groupBy} onValueChange={v => setConfig(c => ({ ...c, groupBy: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {entityCfg.columns.map(col => (
                    <SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sort by */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sort by</Label>
              <Select value={config.sortBy} onValueChange={v => setConfig(c => ({ ...c, sortBy: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {entityCfg.columns.map(col => (
                    <SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sort dir + Limit */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Order / Limit</Label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setConfig(c => ({ ...c, sortDir: c.sortDir === 'asc' ? 'desc' : 'asc' }))}
                  className="flex items-center gap-1 h-9 px-2.5 rounded-md border border-input bg-background text-xs font-medium hover:bg-accent transition-colors"
                >
                  {config.sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {config.sortDir.toUpperCase()}
                </button>
                <Select value={String(config.limit)} onValueChange={v => setConfig(c => ({ ...c, limit: Number(v) }))}>
                  <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[25, 50, 100, 250, 500].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Filters section */}
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setShowFilters(v => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors"
            >
              <Filter className="h-4 w-4 text-indigo-500" />
              Filters
              {config.filters.length > 0 && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                  {config.filters.length}
                </span>
              )}
              {showFilters ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
            </button>
            <button
              onClick={addFilter}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />Add filter
            </button>
          </div>

          {showFilters && config.filters.length === 0 && (
            <p className="text-xs text-slate-400 italic py-1">No filters — showing all records. Click "Add filter" to narrow results.</p>
          )}

          {showFilters && config.filters.map((f, i) => (
            <div key={i} className="flex items-center gap-2 mb-2 flex-wrap">
              <Select value={f.column} onValueChange={v => updateFilter(i, { column: v })}>
                <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {entityCfg.columns.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={f.operator} onValueChange={v => updateFilter(i, { operator: v as FilterDef['operator'] })}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPERATORS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {f.operator !== 'is' && (
                <Input
                  value={f.value}
                  onChange={e => updateFilter(i, { value: e.target.value })}
                  placeholder="value…"
                  className="h-8 text-xs w-36"
                />
              )}
              <button
                onClick={() => removeFilter(i)}
                className="p-1.5 text-slate-300 hover:text-red-400 transition-colors rounded"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Columns section */}
        <div className="px-5 py-3">
          <button
            onClick={() => setShowColumns(v => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors mb-3"
          >
            <Columns className="h-4 w-4 text-indigo-500" />
            Columns
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
              {config.columns.length || entityCfg.columns.length} selected
            </span>
            {showColumns ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
          </button>

          {showColumns && (
            <div className="flex flex-wrap gap-2">
              {entityCfg.columns.map(col => {
                const selected = config.columns.length === 0 || config.columns.includes(col.key);
                return (
                  <button
                    key={col.key}
                    onClick={() => toggleColumn(col.key)}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all ${
                      selected
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    {selected && <Check className="h-3 w-3" />}
                    {col.label}
                  </button>
                );
              })}
              <button
                onClick={() => setConfig(c => ({ ...c, columns: [] }))}
                className="text-xs px-2 py-1.5 text-slate-400 hover:text-slate-600 transition-colors"
              >
                Select all
              </button>
            </div>
          )}
        </div>

        {/* Run bar */}
        <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 flex items-center gap-3 flex-wrap">
          <Button
            onClick={runReport}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          >
            {loading
              ? <><RefreshCw className="h-4 w-4 animate-spin" />Running…</>
              : <><Play className="h-4 w-4" />Run Report</>
            }
          </Button>

          {hasRun && (
            <>
              <span className="text-sm text-slate-500">
                <span className="font-bold text-slate-800">{data.length}</span> rows
              </span>

              <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                <Button size="sm" variant="outline" onClick={() => handleExport('csv')} className="h-8 text-xs gap-1.5">
                  <FileText className="h-3.5 w-3.5" />CSV
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleExport('excel')} className="h-8 text-xs gap-1.5">
                  <FileSpreadsheet className="h-3.5 w-3.5" />Excel
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleExport('pdf')} className="h-8 text-xs gap-1.5">
                  <Download className="h-3.5 w-3.5" />PDF
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSaveDialogOpen(true)} className="h-8 text-xs gap-1.5">
                  <Save className="h-3.5 w-3.5" />Save
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Chart ── */}
      {hasRun && config.chartType !== 'none' && chartData.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-800">
              {entityCfg.label} by {entityCfg.columns.find(c => c.key === config.groupBy)?.label ?? config.groupBy}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{data.length} total records</p>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            {config.chartType === 'bar' ? (
              <BarChart data={chartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartStyle} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={60}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            ) : config.chartType === 'pie' ? (
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%" cy="50%"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={3}
                  strokeWidth={0}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={chartStyle} />
              </PieChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartStyle} />
                <Line type="monotone" dataKey="value" stroke={entityCfg.color} strokeWidth={2} dot={{ fill: entityCfg.color, r: 4 }} />
              </LineChart>
            )}
          </ResponsiveContainer>

          {/* Legend */}
          {config.chartType !== 'pie' && (
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {chartData.slice(0, 6).map((item, i) => (
                <div key={item.name} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  {item.name} <span className="font-bold text-slate-700">({item.value})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Data table ── */}
      {hasRun && (
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              Results
              <span className="ml-2 text-xs font-normal text-slate-400">{data.length} rows</span>
            </h3>
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entityCfg.color }}
              />
              <span className="text-xs font-medium text-slate-500">{entityCfg.label}</span>
            </div>
          </div>

          {data.length === 0 ? (
            <div className="p-16 text-center">
              <FileText className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              <p className="font-semibold text-slate-400">No records found</p>
              <p className="text-sm text-slate-300 mt-1">Try adjusting your filters or limit.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    {visibleCols.map(col => (
                      <th
                        key={col.key}
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, ri) => (
                    <tr key={ri} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                      {visibleCols.map(col => (
                        <td key={col.key} className="px-4 py-3 whitespace-nowrap">
                          {col.type === 'status' && row[col.key]
                            ? <StatusPill value={String(row[col.key])} />
                            : col.type === 'currency'
                              ? <span className="font-semibold text-emerald-600">{formatCell(row[col.key], col.type)}</span>
                              : col.type === 'number'
                                ? <span className="tabular-nums font-medium">{formatCell(row[col.key], col.type)}</span>
                                : <span className="text-slate-700">{formatCell(row[col.key], col.type)}</span>
                          }
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Empty state (not yet run) ── */}
      {!hasRun && !loading && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-16 text-center">
          <BarChart2 className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="font-semibold text-slate-400">Configure your report above</p>
          <p className="text-sm text-slate-300 mt-1">
            Pick a data source, add filters, choose columns, then click Run Report.
          </p>
          <Button
            onClick={runReport}
            className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          >
            <Play className="h-4 w-4" />Run Report
          </Button>
        </div>
      )}

      {/* ── Save dialog ── */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Report name</Label>
              <Input
                value={reportName}
                onChange={e => setReportName(e.target.value)}
                placeholder="e.g. Monthly Won Deals, Open Tickets by Priority…"
                onKeyDown={e => { if (e.key === 'Enter') saveReport(); }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveReport} disabled={!reportName.trim()}>
                <Save className="h-4 w-4 mr-2" />Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}