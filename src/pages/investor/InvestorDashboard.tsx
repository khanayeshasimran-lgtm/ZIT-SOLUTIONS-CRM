/**
 * pages/investor/InvestorDashboard.tsx
 *
 * Read-only dashboard for the investor role.
 * Shows: KPI cards, 6-month revenue trend, pipeline snapshot, notice board.
 * All data is read-only — no actions, no edit buttons.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageLoader } from '@/components/PageLoader';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { format, subMonths, startOfMonth } from 'date-fns';
import { DollarSign, Handshake, TrendingUp, Target, Pin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface NoticePost {
  id: string;
  title: string;
  body: string;
  tag: 'General' | 'Update' | 'Alert';
  pinned: boolean;
  created_at: string;
  created_by_email?: string | null;
}

const tagColors: Record<string, string> = {
  General: 'bg-muted text-muted-foreground',
  Update:  'bg-blue-100 text-blue-700',
  Alert:   'bg-red-100 text-red-700',
};

const stageLabels: Record<string, string> = {
  new_lead: 'New Lead', contacted: 'Contacted',
  meeting_scheduled: 'Meeting', proposal: 'Proposal',
  negotiation: 'Negotiation', won: 'Won', lost: 'Lost',
};

const COLORS = [
  'hsl(213,50%,23%)', 'hsl(213,45%,35%)', 'hsl(213,40%,47%)',
  'hsl(213,35%,59%)', 'hsl(142,71%,45%)', 'hsl(38,92%,50%)', 'hsl(0,72%,51%)',
];

/* ── KPI Card ───────────────────────────────────────────────────────────────── */

function KPI({ title, value, icon: Icon, sub }: {
  title: string; value: string | number; icon: any; sub?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
      <div className="p-3 rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-semibold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */

export default function InvestorDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [deals, setDeals]       = useState<any[]>([]);
  const [notices, setNotices]   = useState<NoticePost[]>([]);
  const [headline, setHeadline] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Access guard
  useEffect(() => {
    if (profile && profile.role !== 'investor') {
      navigate('/dashboard', { replace: true });
    }
  }, [profile, navigate]);

  useEffect(() => {
    if (!user || !profile) return;
    if (profile.role !== 'investor') return;

    const fetchAll = async () => {
      const [
        { data: dealsData },
        { data: noticesData },
        { data: configData },
      ] = await Promise.all([
        supabase.from('deals').select('stage, value, created_at'),
        (supabase as any)
          .from('notice_board')
          .select('id, title, body, tag, pinned, created_at')
          .eq('visible_to_investors', true)
          .order('pinned', { ascending: false })
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('investor_dashboard_config')
          .select('headline, updated_at')
          .limit(1)
          .maybeSingle(),
      ]);

      setDeals(dealsData ?? []);
      setNotices((noticesData ?? []) as NoticePost[]);
      setHeadline(configData?.headline ?? '');
      setLastUpdated(configData?.updated_at
        ? format(new Date(configData.updated_at), 'MMM d, yyyy h:mm a')
        : '');
      setLoading(false);
    };

    fetchAll();
  }, [user, profile]);

  /* ── Derived data ───────────────────────────────────────────────────────── */

  const wonDeals    = deals.filter(d => d.stage === 'won');
  const activeDeals = deals.filter(d => !['won','lost'].includes(d.stage ?? ''));
  const lostDeals   = deals.filter(d => d.stage === 'lost');
  const totalRevenue = wonDeals.reduce((s, d) => s + Number(d.value || 0), 0);
  const closedDeals  = wonDeals.length + lostDeals.length;
  const winRate      = closedDeals > 0 ? Math.round((wonDeals.length / closedDeals) * 100) : 0;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);

  const monthlyRevenue = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const date = startOfMonth(subMonths(new Date(), 5 - i));
      return { month: format(date, 'MMM yyyy'), start: date, value: 0 };
    });
    wonDeals.forEach(d => {
      const dealDate = new Date(d.created_at);
      const m = months.find(m => format(m.start, 'MMM yyyy') === format(startOfMonth(dealDate), 'MMM yyyy'));
      if (m) m.value += Number(d.value || 0);
    });
    return months;
  }, [deals]);

  const pipelineByStage = useMemo(() => {
    const map: Record<string, number> = {};
    deals.forEach(d => {
      const s = d.stage || 'new_lead';
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map).map(([stage, count]) => ({
      stage: stageLabels[stage] || stage,
      count,
    }));
  }, [deals]);

  if (loading || !profile) return <PageLoader />;

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Investor Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            {headline || 'Welcome. Here is your business overview.'}
          </p>
        </div>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground">Last updated: {lastUpdated}</p>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI
          title="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
          sub="From won deals"
        />
        <KPI
          title="Active Deals"
          value={activeDeals.length}
          icon={Handshake}
          sub="In pipeline"
        />
        <KPI
          title="Win Rate"
          value={`${winRate}%`}
          icon={Target}
          sub={`${wonDeals.length} won / ${closedDeals} closed`}
        />
        <KPI
          title="Pipeline Value"
          value={formatCurrency(activeDeals.reduce((s, d) => s + Number(d.value || 0), 0))}
          icon={TrendingUp}
          sub="Open deals"
        />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Revenue trend */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-1">Revenue Trend</h3>
          <p className="text-sm text-muted-foreground mb-4">Last 6 months</p>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => `$${v/1000}k`} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px' }} />
              <Area dataKey="value" type="monotone" stroke={COLORS[0]} fill={`${COLORS[0]}33`} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pipeline snapshot */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-1">Pipeline Snapshot</h3>
          <p className="text-sm text-muted-foreground mb-4">Deals per stage</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={pipelineByStage} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="stage" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px' }} />
              <Bar dataKey="count" fill={COLORS[0]} radius={[6,6,0,0]} maxBarSize={52} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Notice Board ── */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Notice Board</h2>

        {notices.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
            No notices available at this time.
          </div>
        ) : (
          <div className="space-y-3">
            {notices.map(notice => (
              <div
                key={notice.id}
                className={`bg-card border rounded-xl p-5 space-y-2 ${notice.pinned ? 'border-amber-300/50 bg-amber-50/5' : 'border-border'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {notice.pinned && (
                      <Pin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                    <span className="font-semibold text-foreground">{notice.title}</span>
                    <Badge className={tagColors[notice.tag] ?? tagColors.General}>
                      {notice.tag}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(notice.created_at), 'MMM d, yyyy')}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{notice.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}