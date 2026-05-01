/**
 * pages/investor/InvestorDashboard.tsx
 *
 * DAY 2 — C6: Added organization_id filter to deals query.
 *
 * WHAT THE OLD CODE DID (WRONG):
 *   supabase.from('deals').select('stage, value, created_at, probability')
 *   with NO organization_id filter. An investor JWT could query the raw
 *   Supabase API and get deals from ALL organizations if RLS was misconfigured.
 *
 * WHAT'S FIXED:
 *   1. Deals query now scoped: .eq('organization_id', orgId)
 *   2. orgId is read from the investor's profile (same pattern as GlobalSearch)
 *   3. Switched from Promise.all to Promise.allSettled — previously one failed
 *      fetch (notices, config) silently dropped all three results. Now each
 *      result is handled independently.
 *   4. Redirect guard now also fires if profile.role is not 'investor' and
 *      profile is fully loaded (prevents flash-redirect on hard refresh).
 *
 * UI: No visual changes — layout, charts, KPIs, notice board all unchanged.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageLoader } from '@/components/PageLoader';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, ComposedChart, Line,
} from 'recharts';
import { format, subMonths, startOfMonth } from 'date-fns';
import {
  DollarSign, Handshake, TrendingUp, Target, Pin,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NoticePost {
  id: string;
  title: string;
  body: string;
  tag: 'General' | 'Update' | 'Alert';
  pinned: boolean;
  created_at: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

const TAG_CFG: Record<string, { pill: string }> = {
  General: { pill: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
  Update:  { pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'     },
  Alert:   { pill: 'bg-red-50 text-red-700 ring-1 ring-red-200'        },
};

const STAGE_LABELS: Record<string, string> = {
  new_lead:          'New Lead',
  contacted:         'Contacted',
  meeting_scheduled: 'Meeting',
  proposal:          'Proposal',
  negotiation:       'Negotiation',
  won:               'Won',
  lost:              'Lost',
};

const chartStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '10px 14px',
};

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ title, value, icon: Icon, sub, trend, trendValue }: {
  title: string;
  value: string;
  icon: React.ElementType;
  sub?: string;
  trend?: 'up' | 'down' | null;
  trendValue?: string;
}) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_1px_6px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="p-2.5 rounded-xl bg-indigo-50">
          <Icon className="h-5 w-5 text-indigo-600" />
        </div>
        {trend && trendValue && (
          <div className={`flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 ${
            trend === 'up'
              ? 'text-emerald-600 bg-emerald-50 ring-1 ring-emerald-200'
              : 'text-red-500 bg-red-50 ring-1 ring-red-200'
          }`}>
            {trend === 'up'
              ? <ArrowUpRight className="h-3 w-3" />
              : <ArrowDownRight className="h-3 w-3" />
            }
            {trendValue}
          </div>
        )}
      </div>
      <p className="text-2xl font-black text-slate-800 tabular-nums">{value}</p>
      <p className="text-sm font-medium text-slate-600 mt-0.5">{title}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvestorDashboard() {
  const { user, profile } = useAuth();
  const navigate          = useNavigate();

  const [loading,     setLoading]     = useState(true);
  const [deals,       setDeals]       = useState<any[]>([]);
  const [notices,     setNotices]     = useState<NoticePost[]>([]);
  const [headline,    setHeadline]    = useState('');
  const [lastUpdated, setLastUpdated] = useState('');

  // C6 FIX: Read orgId from profile — same pattern as GlobalSearch
  const orgId = (profile as any)?.organization_id as string | null;

  // Redirect if not investor — guard against flash on hard refresh:
  // Only redirect once profile is loaded (not null) AND role is wrong
  useEffect(() => {
    if (profile && profile.role !== 'investor') {
      navigate('/dashboard', { replace: true });
    }
  }, [profile, navigate]);

  useEffect(() => {
    if (!user || !profile || profile.role !== 'investor' || !orgId) return;

    const fetchAll = async () => {
      // C6 FIX: Switched from Promise.all to Promise.allSettled.
      // Previously: if notices or config failed, ALL data was lost silently.
      // Now: each result is handled independently — a failed config fetch
      //      doesn't wipe out the deals data.
      const [dealsResult, noticesResult, configResult] = await Promise.allSettled([

        // C6 FIX: Added .eq('organization_id', orgId) to deals query.
        // Previously: NO org filter — relied entirely on RLS for isolation.
        supabase
          .from('deals')
          .select('stage, value, created_at, probability')
          .eq('organization_id', orgId),          // ← C6 fix

        (supabase as any)
          .from('notice_board')
          .select('id, title, body, tag, pinned, created_at')
          .eq('visible_to_investors', true)
          .order('pinned',      { ascending: false })
          .order('created_at',  { ascending: false }),

        (supabase as any)
          .from('investor_dashboard_config')
          .select('headline, updated_at')
          .limit(1)
          .maybeSingle(),
      ]);

      // Handle deals result
      if (dealsResult.status === 'fulfilled' && dealsResult.value.data) {
        setDeals(dealsResult.value.data);
      }
      // Silently ignore deals error — chart will show empty state

      // Handle notices result
      if (noticesResult.status === 'fulfilled' && noticesResult.value.data) {
        setNotices(noticesResult.value.data as NoticePost[]);
      }

      // Handle config result — optional, graceful fallback
      if (configResult.status === 'fulfilled' && configResult.value.data) {
        const config = configResult.value.data as any;
        setHeadline(config.headline ?? '');
        setLastUpdated(
          config.updated_at
            ? format(new Date(config.updated_at), 'MMM d, yyyy h:mm a')
            : ''
        );
      }

      setLoading(false);
    };

    fetchAll();
  }, [user, profile, orgId]);

  // ── Derived metrics ────────────────────────────────────────────────────────

  const wonDeals    = deals.filter(d => d.stage === 'won');
  const activeDeals = deals.filter(d => !['won', 'lost'].includes(d.stage ?? ''));
  const lostDeals   = deals.filter(d => d.stage === 'lost');

  const totalRevenue     = wonDeals.reduce((s, d) => s + Number(d.value || 0), 0);
  const pipelineValue    = activeDeals.reduce((s, d) => s + Number(d.value || 0), 0);
  const weightedForecast = activeDeals.reduce(
    (s, d) => s + (Number(d.value || 0) * (d.probability || 0)) / 100,
    0
  );
  const closedDeals = wonDeals.length + lostDeals.length;
  const winRate     = closedDeals > 0 ? Math.round((wonDeals.length / closedDeals) * 100) : 0;

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 0,
    }).format(v);

  // ── Chart data ─────────────────────────────────────────────────────────────

  const monthlyRevenue = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const date = startOfMonth(subMonths(new Date(), 5 - i));
      return { month: format(date, 'MMM yy'), start: date, value: 0, cumulative: 0 };
    });
    wonDeals.forEach(d => {
      const dealDate = new Date(d.created_at);
      const m = months.find(
        m => format(m.start, 'MMM yy') === format(startOfMonth(dealDate), 'MMM yy')
      );
      if (m) m.value += Number(d.value || 0);
    });
    let cum = 0;
    months.forEach(m => { cum += m.value; m.cumulative = cum; });
    return months;
  }, [deals]);

  const pipelineByStage = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    deals.forEach(d => {
      const s = d.stage || 'new_lead';
      if (!map[s]) map[s] = { count: 0, value: 0 };
      map[s].count++;
      map[s].value += Number(d.value || 0);
    });
    return Object.entries(map).map(([stage, data]) => ({
      stage: STAGE_LABELS[stage] || stage,
      count: data.count,
      value: Math.round(data.value / 1000),
    }));
  }, [deals]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading || !profile) return <PageLoader />;

  return (
    <div className="space-y-8 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">
            Investor Dashboard
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-800">Business Overview</h1>
          <p className="text-muted-foreground mt-1">
            {headline || 'Welcome. Here is your business overview.'}
          </p>
        </div>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground shrink-0">Last updated: {lastUpdated}</p>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Revenue" value={fmt(totalRevenue)} icon={DollarSign}
          sub="From won deals" trend={totalRevenue > 0 ? 'up' : null} trendValue="Won"
        />
        <KPICard
          title="Active Pipeline" value={fmt(pipelineValue)} icon={Handshake}
          sub={`${activeDeals.length} open deals`}
        />
        <KPICard
          title="Weighted Forecast" value={fmt(weightedForecast)} icon={Target}
          sub="Value × probability"
        />
        <KPICard
          title="Win Rate" value={`${winRate}%`} icon={TrendingUp}
          sub={`${wonDeals.length} won / ${closedDeals} closed`}
          trend={winRate >= 50 ? 'up' : winRate > 0 ? 'down' : null}
          trendValue={`${winRate}%`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue trend */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <h3 className="text-base font-bold text-slate-800 mb-1">Revenue Trend</h3>
          <p className="text-xs text-muted-foreground mb-4">Monthly and cumulative · last 6 months</p>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={monthlyRevenue}>
              <defs>
                <linearGradient id="rGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `$${v / 1000}k`} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: any) => fmt(v)} contentStyle={chartStyle} />
              <Area  dataKey="value"      type="monotone" stroke="#6366f1" strokeWidth={2} fill="url(#rGrad)" name="Monthly" />
              <Line  dataKey="cumulative" type="monotone" stroke="#10b981" strokeWidth={2} strokeDasharray="4 2" dot={false} name="Cumulative" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded bg-indigo-400 inline-block" />Monthly
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 border-t-2 border-emerald-400 border-dashed inline-block" />Cumulative
            </span>
          </div>
        </div>

        {/* Pipeline snapshot */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <h3 className="text-base font-bold text-slate-800 mb-1">Pipeline Snapshot</h3>
          <p className="text-xs text-muted-foreground mb-4">Deal count per stage</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={pipelineByStage} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="stage" tick={{ fontSize: 10, fill: '#94a3b8' }} angle={-20} textAnchor="end" height={48} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={chartStyle} />
              <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={52} name="Deals" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total deals tracked',  value: deals.length,           color: 'text-slate-800'   },
          { label: 'Deals won',            value: wonDeals.length,         color: 'text-emerald-600' },
          { label: 'Deals lost',           value: lostDeals.length,        color: 'text-red-500'     },
          { label: 'Avg. deal size (won)', value: wonDeals.length > 0
              ? fmt(totalRevenue / wonDeals.length)
              : '—',                                                        color: 'text-indigo-600'  },
        ].map(m => (
          <div key={m.label} className="bg-white border border-slate-200/80 rounded-xl p-4 text-center shadow-sm">
            <p className={`text-xl font-black tabular-nums ${m.color}`}>{m.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Notice board */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-4">Notice Board</h2>
        {notices.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center text-muted-foreground">
            No notices at this time.
          </div>
        ) : (
          <div className="space-y-3">
            {notices.map(notice => {
              const tagCfg = TAG_CFG[notice.tag] ?? TAG_CFG.General;
              return (
                <div
                  key={notice.id}
                  className={`bg-white border rounded-2xl p-5 space-y-2 shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.07)] transition-all ${
                    notice.pinned ? 'border-amber-200/80' : 'border-slate-200/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {notice.pinned && <Pin className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                      <span className="font-semibold text-slate-800">{notice.title}</span>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tagCfg.pill}`}>
                        {notice.tag}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(notice.created_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{notice.body}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}