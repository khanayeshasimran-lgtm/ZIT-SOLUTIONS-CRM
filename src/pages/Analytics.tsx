import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageLoader } from '@/components/PageLoader';
import { EmptyChart } from '@/components/dashboard/EmptyChart';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
  ComposedChart, Line, ReferenceLine,
} from 'recharts';
import {
  format, subMonths, startOfMonth, addMonths, isBefore, isAfter,
} from 'date-fns';
import { TrendingUp, Users, Briefcase, DollarSign, Target, TrendingDown, Award } from 'lucide-react';
import { getWeightedForecast } from '@/services/deals.service';

// ── Colours ───────────────────────────────────────────────────────────────────

const COLORS = ['#6366f1','#8b5cf6','#10b981','#f59e0b','#f97316','#0ea5e9','#ec4899'];

const GRADIENTS = [
  { from: 'from-indigo-500', to: 'to-violet-600', bg: 'bg-indigo-50', text: 'text-indigo-700', icon: 'text-indigo-500', border: 'border-indigo-100' },
  { from: 'from-emerald-500', to: 'to-teal-600',  bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-500', border: 'border-emerald-100' },
  { from: 'from-violet-500', to: 'to-purple-600', bg: 'bg-violet-50', text: 'text-violet-700', icon: 'text-violet-500', border: 'border-violet-100' },
  { from: 'from-amber-500', to: 'to-orange-500',  bg: 'bg-amber-50', text: 'text-amber-700', icon: 'text-amber-500', border: 'border-amber-100' },
];

const chartStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '10px 14px',
};

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ title, value, icon: Icon, index = 0, sub }: {
  title: string; value: string | number; icon: any; index?: number; sub?: string;
}) {
  const g = GRADIENTS[index % GRADIENTS.length];
  return (
    <div className={`relative bg-white border ${g.border} rounded-2xl p-5 flex items-center gap-4 overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] transition-shadow`}>
      <div className={`absolute inset-0 opacity-[0.03] bg-gradient-to-br ${g.from} ${g.to}`} />
      <div className={`relative p-2.5 rounded-xl ${g.bg}`}>
        <Icon className={`h-5 w-5 ${g.icon}`} />
      </div>
      <div className="relative">
        <p className="text-sm text-muted-foreground font-medium">{title}</p>
        <p className={`text-2xl font-black tabular-nums ${g.text}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Chart card wrapper ────────────────────────────────────────────────────────

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
      <div className="mb-5">
        <h3 className="text-base font-bold text-slate-800">{title}</h3>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { user } = useAuth();
  const [loading,     setLoading]     = useState(true);
  const [deals,       setDeals]       = useState<any[]>([]);
  const [leads,       setLeads]       = useState<any[]>([]);
  const [activities,  setActivities]  = useState<any[]>([]);
  const [profiles,    setProfiles]    = useState<any[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      if (!user) return;
      const [
        { data: d },
        { data: l },
        { data: a },
        { data: p },
      ] = await Promise.all([
        (supabase as any).from('deals').select('*'),
        (supabase as any).from('leads').select('*'),
        (supabase as any).from('activities').select('*'),
        (supabase as any).from('profiles').select('id, email'),
      ]);
      setDeals(d ?? []);
      setLeads(l ?? []);
      setActivities(a ?? []);
      setProfiles(p ?? []);
      setLoading(false);
    };
    fetchAll();
  }, [user]);

  // ── Derived KPIs ──────────────────────────────────────────────────────────────

  const wonDeals    = deals.filter(d => d.stage === 'won');
  const activeDeals = deals.filter(d => ['contacted','meeting_scheduled','proposal','negotiation'].includes(d.stage));
  const totalRevenue   = wonDeals.reduce((s, d) => s + Number(d.value || 0), 0);
  const conversionRate = leads.length === 0 ? 0 : Math.round((wonDeals.length / leads.length) * 100);
  const weightedForecast = getWeightedForecast(deals);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);

  // ── Revenue growth chart — actual past + forecast future ─────────────────────
  // Past months: sum of won deal values by created_at
  // Future months: sum of active deal weighted values by expected_close_date

  const revenueChartData = useMemo(() => {
    const today = new Date();

    // Past 6 months of actual revenue
    const past = Array.from({ length: 6 }, (_, i) => {
      const date  = startOfMonth(subMonths(today, 5 - i));
      const month = format(date, 'MMM yy');
      const value = wonDeals
        .filter(d => format(startOfMonth(new Date(d.created_at)), 'MMM yy') === month)
        .reduce((s, d) => s + Number(d.value || 0), 0);
      return { month, actual: value, forecast: null as number | null, isPast: true };
    });

    // Next 3 months of forecast (weighted pipeline)
    const future = Array.from({ length: 3 }, (_, i) => {
      const date  = startOfMonth(addMonths(today, i + 1));
      const month = format(date, 'MMM yy');
      const value = deals
        .filter(d => {
          if (!d.expected_close_date || ['won','lost'].includes(d.stage)) return false;
          return format(startOfMonth(new Date(d.expected_close_date)), 'MMM yy') === month;
        })
        .reduce((s, d) => s + (Number(d.value || 0) * (d.probability || 0)) / 100, 0);
      return { month, actual: null as number | null, forecast: value, isPast: false };
    });

    // Bridge: current month gets both actual + forecast
    const currentMonth = format(today, 'MMM yy');
    const bridgeForecast = deals
      .filter(d => {
        if (!d.expected_close_date || ['won','lost'].includes(d.stage)) return false;
        return format(startOfMonth(new Date(d.expected_close_date)), 'MMM yy') === currentMonth;
      })
      .reduce((s, d) => s + (Number(d.value || 0) * (d.probability || 0)) / 100, 0);

    const result = [...past, ...future];
    const todayEntry = result.find(r => r.month === currentMonth);
    if (todayEntry) todayEntry.forecast = bridgeForecast;

    return result;
  }, [deals, wonDeals]);

  // ── Lead sources ──────────────────────────────────────────────────────────────

  const leadSources = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => { const k = l.source || 'Unknown'; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([source, count]) => ({ source, count }));
  }, [leads]);

  // ── Activity breakdown ────────────────────────────────────────────────────────

  const activityStats = useMemo(() => {
    const map: Record<string, number> = {};
    activities.forEach(a => { map[a.type] = (map[a.type] || 0) + 1; });
    return Object.entries(map).map(([type, count]) => ({
      type: type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
      count,
    }));
  }, [activities]);

  // ── Funnel drop-off ───────────────────────────────────────────────────────────
  // For each stage: how many deals entered it vs how many were lost at/after it.
  // Shows where the pipeline leaks.

  const funnelData = useMemo(() => {
    const stages = ['new_lead','contacted','meeting_scheduled','proposal','negotiation'];
    const stageLabels: Record<string, string> = {
      new_lead: 'New Lead', contacted: 'Contacted', meeting_scheduled: 'Meeting',
      proposal: 'Proposal', negotiation: 'Negotiation',
    };

    return stages.map(stage => {
      const total  = deals.filter(d => d.stage === stage || d.stage === 'won' || d.stage === 'lost').length;
      const atStage = deals.filter(d => d.stage === stage).length;
      const won    = deals.filter(d => d.stage === 'won').length;
      const lostHere = deals.filter(d => d.stage === 'lost' && d.last_stage === stage).length;

      // Simpler: count deals currently in this stage + won/lost after passing through it
      const progressed = deals.filter(d =>
        ['won','lost'].includes(d.stage) ? true : d.stage === stage
      ).length;

      const count = deals.filter(d => d.stage === stage).length;
      const progress = atStage > 0 ? Math.round((won / Math.max(deals.length, 1)) * 100) : 0;

      return {
        stage:     stageLabels[stage],
        count,
        progressed: Math.round((atStage / Math.max(deals.length, 1)) * 100),
        lost:       deals.filter(d => d.stage === 'lost').length,
      };
    });
  }, [deals]);

  // Simplified funnel: just show deals count per stage as a horizontal funnel
  const simpleFunnel = useMemo(() => {
    const stageOrder = ['new_lead','contacted','meeting_scheduled','proposal','negotiation','won'];
    const labels: Record<string, string> = {
      new_lead: 'New Lead', contacted: 'Contacted', meeting_scheduled: 'Meeting',
      proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won',
    };
    const maxCount = Math.max(...stageOrder.map(s => deals.filter(d => d.stage === s).length), 1);
    return stageOrder.map((stage, i) => {
      const count    = deals.filter(d => d.stage === stage).length;
      const value    = deals.filter(d => d.stage === stage).reduce((s, d) => s + Number(d.value || 0), 0);
      const prevCount = i > 0 ? deals.filter(d => d.stage === stageOrder[i - 1]).length : count;
      const dropPct  = prevCount > 0 ? Math.round(((prevCount - count) / prevCount) * 100) : 0;
      return { stage: labels[stage], count, value, dropPct: i > 0 ? dropPct : 0, pct: Math.round((count / maxCount) * 100) };
    });
  }, [deals]);

  // ── CLV — Customer Lifetime Value per company ─────────────────────────────────

  const clvData = useMemo(() => {
    const map: Record<string, { name: string; value: number; count: number; lastDeal: string }> = {};
    wonDeals.forEach(d => {
      const key   = d.company_id || d.lead_id || 'unknown';
      const name  = d.company_name || d.lead_name || d.title || 'Unknown';
      if (!map[key]) map[key] = { name, value: 0, count: 0, lastDeal: d.created_at };
      map[key].value += Number(d.value || 0);
      map[key].count++;
      if (new Date(d.created_at) > new Date(map[key].lastDeal)) map[key].lastDeal = d.created_at;
    });
    return Object.values(map)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [wonDeals]);

  // ── Conversion rate per employee ──────────────────────────────────────────────

  const conversionByEmployee = useMemo(() => {
    const emailMap: Record<string, string> = {};
    profiles.forEach((p: any) => { emailMap[p.id] = p.email; });

    const byUser: Record<string, { email: string; won: number; total: number }> = {};
    deals.forEach(d => {
      const uid = d.created_by;
      if (!uid) return;
      if (!byUser[uid]) byUser[uid] = { email: emailMap[uid] ?? uid.slice(0, 8), won: 0, total: 0 };
      byUser[uid].total++;
      if (d.stage === 'won') byUser[uid].won++;
    });

    return Object.values(byUser)
      .filter(u => u.total >= 1)
      .map(u => ({
        name:     u.email.split('@')[0],
        won:      u.won,
        total:    u.total,
        rate:     Math.round((u.won / u.total) * 100),
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 8);
  }, [deals, profiles]);

  // ── Conversion funnel (for bar chart) ─────────────────────────────────────────

  const funnelStages = ['new_lead','contacted','meeting_scheduled','proposal','negotiation','won'];
  const conversionData = funnelStages.map(stage => ({
    stage: stage.replace('_',' ').replace(/\b\w/g, c => c.toUpperCase()),
    count: deals.filter(d => d.stage === stage).length,
  }));

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="text-muted-foreground mt-1">Business performance overview</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Leads"        value={leads.length}               icon={Users}       index={0} />
        <StatCard title="Conversion Rate"    value={`${conversionRate}%`}       icon={TrendingUp}  index={1} />
        <StatCard title="Active Deals"       value={activeDeals.length}         icon={Briefcase}   index={2} />
        <StatCard title="Total Revenue"      value={formatCurrency(totalRevenue)} icon={DollarSign} index={3} />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Weighted Forecast"  value={formatCurrency(weightedForecast)} icon={Target}      index={0} sub="Value × probability" />
        <StatCard title="Won Deals"          value={wonDeals.length}                  icon={Award}       index={1} sub="Closed won" />
        <StatCard title="Avg Deal Size"      value={wonDeals.length > 0 ? formatCurrency(totalRevenue / wonDeals.length) : '—'} icon={TrendingDown} index={2} sub="Won deals only" />
      </div>

      {/* ── Row 1: Revenue forecast + Lead sources ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Revenue forecast chart */}
        <ChartCard title="Revenue Growth & Forecast" sub="Actual (solid) vs weighted forecast (dashed) · 6 months back, 3 forward">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={revenueChartData}>
              <defs>
                <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `$${v/1000}k`} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: any) => v !== null ? formatCurrency(v) : '—'} contentStyle={chartStyle} />
              {/* Vertical reference line at today */}
              <ReferenceLine x={format(new Date(), 'MMM yy')} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: 'Today', position: 'top', fontSize: 10, fill: '#94a3b8' }} />
              <Area dataKey="actual"   type="monotone" stroke="#6366f1" strokeWidth={2} fill="url(#actualGrad)"   connectNulls />
              <Area dataKey="forecast" type="monotone" stroke="#10b981" strokeWidth={2} fill="url(#forecastGrad)" strokeDasharray="5 3" connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded bg-indigo-400 inline-block" />Actual revenue</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-emerald-400 border-dashed inline-block" />Forecast (weighted)</span>
          </div>
        </ChartCard>

        {/* Lead sources */}
        <ChartCard title="Lead Sources" sub="Where your leads come from">
          {leadSources.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={leadSources} dataKey="count" nameKey="source"
                  outerRadius={100} innerRadius={55} paddingAngle={3}
                  label={({ source, percent }) => `${source} (${(percent * 100).toFixed(0)}%)`}
                >
                  {leadSources.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} strokeWidth={0} />)}
                </Pie>
                <Tooltip contentStyle={chartStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart title="Lead Sources" />
          )}
        </ChartCard>
      </div>

      {/* ── Row 2: Funnel drop-off + Activity breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Funnel drop-off */}
        <ChartCard title="Pipeline Funnel" sub="Deal count narrowing through each stage">
          {simpleFunnel.some(s => s.count > 0) ? (
            <div className="space-y-2 mt-2">
              {simpleFunnel.map((row, i) => (
                <div key={row.stage} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-24 text-right shrink-0">{row.stage}</span>
                  <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg flex items-center px-2.5 transition-all duration-700"
                      style={{
                        width: `${Math.max(row.pct, row.count > 0 ? 5 : 0)}%`,
                        background: `linear-gradient(to right, ${COLORS[i % COLORS.length]}dd, ${COLORS[i % COLORS.length]}88)`,
                      }}
                    >
                      {row.count > 0 && (
                        <span className="text-[11px] font-bold text-white">{row.count}</span>
                      )}
                    </div>
                  </div>
                  {/* Drop-off indicator */}
                  {row.dropPct > 0 && (
                    <span className="text-[10px] text-red-500 font-semibold w-14 shrink-0">
                      ▼ {row.dropPct}%
                    </span>
                  )}
                  {row.dropPct === 0 && <span className="w-14 shrink-0" />}
                </div>
              ))}
              <p className="text-xs text-muted-foreground mt-3">
                ▼ % shows deals lost between stages
              </p>
            </div>
          ) : (
            <EmptyChart title="Pipeline Funnel" />
          )}
        </ChartCard>

        {/* Activity breakdown */}
        <ChartCard title="Activity Breakdown" sub="Tasks by type">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={activityStats} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="type" width={90} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={chartStyle} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[0,6,6,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Row 3: CLV table + Conversion by employee ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Customer Lifetime Value */}
        <ChartCard title="Customer Lifetime Value" sub="Revenue from won deals grouped by company">
          {clvData.length > 0 ? (
            <div className="space-y-0 -mx-2">
              <div className="grid grid-cols-3 px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-slate-100">
                <span>Company / Lead</span>
                <span className="text-right">Revenue</span>
                <span className="text-right">Deals</span>
              </div>
              {clvData.map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-3 px-3 py-2.5 text-sm hover:bg-slate-50/60 transition-colors border-b border-slate-50 last:border-0"
                >
                  <span className="font-medium text-slate-800 truncate pr-2">{row.name}</span>
                  <span className="text-right font-semibold text-emerald-600">{formatCurrency(row.value)}</span>
                  <span className="text-right text-muted-foreground">{row.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              No won deals yet — CLV data will appear here
            </div>
          )}
        </ChartCard>

        {/* Conversion rate per employee */}
        <ChartCard title="Conversion by Team Member" sub="Win rate per user (won / total deals)">
          {conversionByEmployee.length > 0 ? (
            <div className="space-y-3 mt-1">
              {conversionByEmployee.map((emp, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700 truncate max-w-[180px]">{emp.name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">{emp.won}/{emp.total} deals</span>
                      <span className={`text-xs font-bold tabular-nums ${emp.rate >= 50 ? 'text-emerald-600' : emp.rate >= 25 ? 'text-amber-600' : 'text-slate-400'}`}>
                        {emp.rate}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${emp.rate >= 50 ? 'bg-emerald-400' : emp.rate >= 25 ? 'bg-amber-400' : 'bg-slate-300'}`}
                      style={{ width: `${emp.rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              No deal data per user yet
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Conversion funnel bar chart ── */}
      <ChartCard title="Conversion Funnel" sub="Deals by pipeline stage">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={conversionData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="stage" angle={-20} textAnchor="end" height={60} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={chartStyle} />
            <Bar dataKey="count" fill="#10b981" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

    </div>
  );
}