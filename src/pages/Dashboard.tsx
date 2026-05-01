import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageLoader } from '@/components/PageLoader';
import { KPICard } from '@/components/dashboard/KPICard';
import { EmptyChart } from '@/components/dashboard/EmptyChart';
import { Badge } from '@/components/ui/badge';
import {
  Clock, AlertTriangle, DollarSign, TrendingUp, Handshake,
  UserPlus, Target, Users, Building2, Pin, CalendarClock,
  Video, MapPin, Phone, TrendingDown,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

import { getWeightedForecast } from '@/services/deals.service';
import { notifyIdleLead } from '@/services/notifications.service';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalRevenue:     number;
  pipelineValue:    number;
  weightedForecast: number;
  activeDeals:      number;
  newLeads:         number;
  winRate:          number;
  totalContacts:    number;
  totalCompanies:   number;
  overdueTasks:     number;
}

interface DealsByStage { stage: string; count: number; value: number; }

interface UpcomingMeeting {
  id: string; title: string; start_time: string;
  mode: 'virtual' | 'in_person' | 'phone';
  meeting_type: string; video_link: string | null; location: string | null;
}

interface Notice {
  id: string; title: string; body: string;
  tag: 'General' | 'Update' | 'Alert'; pinned: boolean; created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = ['#6366f1','#8b5cf6','#0ea5e9','#14b8a6','#f59e0b','#10b981','#f97316'];

const stageLabels: Record<string, string> = {
  new_lead: 'New Lead', contacted: 'Contacted', meeting_scheduled: 'Meeting',
  proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost',
};

const tagColors: Record<string, string> = {
  General: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  Update:  'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  Alert:   'bg-red-50 text-red-600 ring-1 ring-red-200',
};

const meetingTypeColors: Record<string, string> = {
  discovery: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  demo:      'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  follow_up: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  check_in:  'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  internal:  'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  other:     'bg-muted text-muted-foreground ring-1 ring-border',
};

// ── Meeting countdown card ─────────────────────────────────────────────────────

function useCountdown(targetISO: string) {
  const [seconds, setSeconds] = useState(() =>
    Math.max(0, differenceInSeconds(parseISO(targetISO), new Date()))
  );
  useEffect(() => {
    const tick = () =>
      setSeconds(Math.max(0, differenceInSeconds(parseISO(targetISO), new Date())));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetISO]);

  if (seconds <= 0) return 'Starting now!';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h > 0 ? `${h}h ` : ''}${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

function MeetingCountdownCard({ meeting }: { meeting: UpcomingMeeting }) {
  const countdown = useCountdown(meeting.start_time);
  const isImminent = differenceInSeconds(parseISO(meeting.start_time), new Date()) < 1800;
  const ModeIcon =
    meeting.mode === 'virtual'   ? Video :
    meeting.mode === 'in_person' ? MapPin : Phone;

  return (
    <div className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-all hover:shadow-md
      ${isImminent ? 'bg-amber-50/40 border-amber-300/60' : 'bg-white border-slate-200/80 hover:border-indigo-200'}`}
    >
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0
        ${isImminent ? 'bg-amber-100' : 'bg-indigo-50'}`}>
        <ModeIcon className={`h-5 w-5 ${isImminent ? 'text-amber-600' : 'text-indigo-600'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm truncate text-slate-900">{meeting.title}</p>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${meetingTypeColors[meeting.meeting_type] ?? meetingTypeColors.other}`}>
            {meeting.meeting_type.replace('_', ' ')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {format(parseISO(meeting.start_time), 'MMM d, yyyy · h:mm a')}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-muted-foreground mb-0.5">Starts in</p>
        <p className={`text-base font-mono font-bold tabular-nums
          ${isImminent ? 'text-amber-600 animate-pulse' : 'text-indigo-600'}`}>
          {countdown}
        </p>
      </div>
      {meeting.video_link && (
        <a
          href={meeting.video_link}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg
            bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700
            transition-all shadow-sm shadow-indigo-200"
        >
          <Video className="h-3.5 w-3.5" />
          Join
        </a>
      )}
    </div>
  );
}

// ── Alert banner ──────────────────────────────────────────────────────────────

function AlertBanner({ count, type, onClick }: {
  count: number; type: 'stalled_deals' | 'overdue_tasks'; onClick: () => void;
}) {
  if (count === 0) return null;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg
                 bg-red-50 text-red-700 ring-1 ring-red-200
                 hover:bg-red-100 transition-colors"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>
        {count} {type === 'stalled_deals' ? 'stalled deal' : 'overdue task'}{count !== 1 ? 's' : ''}
      </span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0, pipelineValue: 0, weightedForecast: 0,
    activeDeals: 0, newLeads: 0, winRate: 0,
    totalContacts: 0, totalCompanies: 0, overdueTasks: 0,
  });
  const [dealsByStage,     setDealsByStage]     = useState<DealsByStage[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<UpcomingMeeting[]>([]);
  const [notices,          setNotices]          = useState<Notice[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [idleLeadsCount,   setIdleLeadsCount]   = useState(0);
  const [stalledDeals,     setStalledDeals]     = useState(0);
  const idleLeadNotified = useRef(false);

  // Investor gets their own dedicated dashboard
  useEffect(() => {
    if (role === 'investor') navigate('/investor', { replace: true });
  }, [role, navigate]);

  // ── Fetch helpers ───────────────────────────────────────────────────────────

  const fetchUpcomingMeetings = async () => {
    if (!user) return;
    const now   = new Date().toISOString();
    const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    // All roles see all upcoming meetings — company-wide awareness
    const { data } = await (supabase as any)
      .from('meetings')
      .select('id, title, start_time, mode, meeting_type, video_link, location')
      .eq('status', 'scheduled')
      .gte('start_time', now)
      .lte('start_time', in24h)
      .order('start_time', { ascending: true });
    setUpcomingMeetings((data ?? []) as UpcomingMeeting[]);
  };

const fetchIdleLeads = async () => {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - 3);

  const { data, count } = await supabase
    .from('leads')
    .select('id, name', { count: 'exact' })
    .or(`last_contacted_at.lt.${threshold.toISOString()},last_contacted_at.is.null`)
    .neq('status', 'qualified');

  if (typeof count === 'number') setIdleLeadsCount(count);

  if (!idleLeadNotified.current && count && count > 0 && data?.length) {
    await notifyIdleLead({
      leadName: data[0].name,
      daysSinceContact: 3,
    });

    idleLeadNotified.current = true;
  }
};

  const fetchNotices = async () => {
    const { data } = await (supabase as any)
      .from('notice_board')
      .select('id, title, body, tag, pinned, created_at')
      .eq('visible_to_investors', true)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5);
    setNotices((data ?? []) as Notice[]);
  };

  const fetchStalledDeals = async () => {
    // Company-wide stalled deal count — visible to everyone as awareness
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 7);
    const { count } = await (supabase as any)
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .not('stage', 'in', '("won","lost")')
      .lt('updated_at', threshold.toISOString());
    if (typeof count === 'number') setStalledDeals(count);
  };

  // ── Main data fetch — ALL records, ALL roles ────────────────────────────────

  useEffect(() => {
    const fetchAll = async () => {
      if (!user) return;
      try {
        // Fetch the full company pipeline — no user filter
        const { data: deals } = await (supabase as any).from('deals').select('*');
        const wonDeals    = deals?.filter((d: any) => d.stage === 'won')                      ?? [];
        const lostDeals   = deals?.filter((d: any) => d.stage === 'lost')                     ?? [];
        const activeDeals = deals?.filter((d: any) => !['won','lost'].includes(d.stage ?? '')) ?? [];

        const totalRevenue     = wonDeals.reduce((s: number, d: any) => s + (Number(d.value) || 0), 0);
        const pipelineValue    = activeDeals.reduce((s: number, d: any) => s + (Number(d.value) || 0), 0);
        const closedDeals      = wonDeals.length + lostDeals.length;
        const winRate          = closedDeals > 0 ? Math.round((wonDeals.length / closedDeals) * 100) : 0;
        const weightedForecast = getWeightedForecast(deals ?? []);

        // All leads, contacts, companies — company-wide totals
        const { data: leads }     = await (supabase as any).from('leads').select('*');
        const { data: contacts }  = await supabase.from('contacts').select('id');
        const { data: companies } = await supabase.from('companies').select('id');

        // Overdue tasks — all across the team
        const { count: overdueCount } = await supabase
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'scheduled')
          .lt('due_date', new Date().toISOString());

        setStats({
          totalRevenue, pipelineValue, weightedForecast,
          activeDeals:    activeDeals.length,
          newLeads:       leads?.filter((l: any) => l.status === 'new').length ?? 0,
          winRate,
          totalContacts:  contacts?.length  ?? 0,
          totalCompanies: companies?.length ?? 0,
          overdueTasks:   overdueCount      ?? 0,
        });

        // Build stage distribution from all company deals
        const stageMap = (deals ?? []).reduce(
          (acc: Record<string, { count: number; value: number }>, deal: any) => {
            const stage = deal.stage || 'new_lead';
            if (!acc[stage]) acc[stage] = { count: 0, value: 0 };
            acc[stage].count++;
            acc[stage].value += Number(deal.value) || 0;
            return acc;
          }, {}
        );
        setDealsByStage(
          Object.entries(stageMap).map(([stage, d]: [string, any]) => ({
            stage: stageLabels[stage] || stage,
            count: d.count,
            value: d.value,
          }))
        );
      } catch (err) {
        console.error('Dashboard error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
    fetchIdleLeads();
    fetchUpcomingMeetings();
    fetchNotices();
    fetchStalledDeals();
  }, [user, role]);

  // ── Realtime subscription — deals table ────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('dashboard-deals-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => {
        fetchStalledDeals();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);

  const chartStyle = {
    backgroundColor: '#ffffff', border: '1px solid #e2e8f0',
    borderRadius: '12px', padding: '10px 14px',
  };

  if (loading) return <PageLoader />;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Company-wide overview — all team activity in one place.
          </p>
        </div>
        {/* Alert badges — visible to ALL roles so every team member is aware */}
        <div className="flex items-center gap-3 flex-wrap">
          <AlertBanner
            count={stalledDeals}
            type="stalled_deals"
            onClick={() => navigate('/pipeline')}
          />
          <AlertBanner
            count={stats.overdueTasks}
            type="overdue_tasks"
            onClick={() => navigate('/activities?filter=overdue')}
          />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live data
          </div>
        </div>
      </div>

      {/* Upcoming meetings — all team meetings, all roles */}
      {upcomingMeetings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-indigo-600" />
            <h2 className="font-semibold text-foreground">
              Upcoming Meetings{' '}
              <span className="text-muted-foreground font-normal text-sm">(next 24 hours)</span>
            </h2>
          </div>
          <div className="space-y-2">
            {upcomingMeetings.map(m => (
              <MeetingCountdownCard key={m.id} meeting={m} />
            ))}
          </div>
        </div>
      )}

      {/* KPI row 1 — revenue */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <KPICard title="Total Revenue"  value={formatCurrency(stats.totalRevenue)}  icon={DollarSign} isEmpty={stats.totalRevenue === 0}  variant="gradient" />
        <KPICard title="Pipeline Value" value={formatCurrency(stats.pipelineValue)} icon={TrendingUp}  isEmpty={stats.pipelineValue === 0} />
        <KPICard title="Active Deals"   value={stats.activeDeals}                   icon={Handshake}   isEmpty={stats.activeDeals === 0} />
        <KPICard title="New Leads"      value={stats.newLeads}                      icon={UserPlus}    isEmpty={stats.newLeads === 0} />
      </div>

      {/* KPI row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <div className="relative bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl p-5
                        flex items-center gap-4 overflow-hidden shadow-md shadow-indigo-200/40">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_#fff,_transparent)]" />
          <div className="relative p-2.5 rounded-xl bg-white/20">
            <TrendingDown className="h-5 w-5 text-white" />
          </div>
          <div className="relative">
            <p className="text-xs font-medium text-indigo-100">Weighted Forecast</p>
            <p className="text-2xl font-black text-white tabular-nums">{formatCurrency(stats.weightedForecast)}</p>
            <p className="text-xs text-indigo-200 mt-0.5">Value × probability</p>
          </div>
        </div>
        <KPICard title="Win Rate"        value={`${stats.winRate}%`}     icon={Target}    isEmpty={stats.winRate === 0} />
        <KPICard title="Total Contacts"  value={stats.totalContacts}     icon={Users}     isEmpty={stats.totalContacts === 0} />
        <KPICard title="Total Companies" value={stats.totalCompanies}    icon={Building2} isEmpty={stats.totalCompanies === 0} />
      </div>

      {/* Alerts panel — visible to ALL roles */}
      <div className="rounded-xl border border-amber-200/60 bg-amber-50/30 p-4 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Team Alerts
          {role === 'user' && (
            <span className="text-xs font-normal text-muted-foreground ml-1">
              — showing company-wide status
            </span>
          )}
        </h3>
        {idleLeadsCount > 0 && (
          <button
            onClick={() => navigate('/leads?filter=idle')}
            className="flex items-center gap-2 text-amber-700 hover:text-amber-900 hover:underline transition-colors"
          >
            <Clock className="h-4 w-4" />
            <span>{idleLeadsCount} idle leads need follow-up</span>
          </button>
        )}
        {stats.overdueTasks > 0 && (
          <button
            onClick={() => navigate('/activities?filter=overdue')}
            className="flex items-center gap-2 text-red-600 hover:text-red-800 hover:underline transition-colors"
          >
            <AlertTriangle className="h-4 w-4" />
            <span>{stats.overdueTasks} overdue tasks pending</span>
          </button>
        )}
        {stalledDeals > 0 && (
          <button
            onClick={() => navigate('/pipeline')}
            className="flex items-center gap-2 text-orange-600 hover:text-orange-800 hover:underline transition-colors"
          >
            <Clock className="h-4 w-4" />
            <span>{stalledDeals} deals stalled for 7+ days</span>
          </button>
        )}
        {idleLeadsCount === 0 && stats.overdueTasks === 0 && stalledDeals === 0 && (
          <p className="text-muted-foreground text-sm">No urgent issues right now 🎉</p>
        )}
      </div>

      {/* Notice board */}
      {notices.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Notices</h3>
          <div className="space-y-2">
            {notices.map(notice => (
              <div
                key={notice.id}
                className={`rounded-xl border p-4 space-y-1.5 transition-all hover:shadow-sm
                  ${notice.pinned
                    ? 'border-amber-300/50 bg-amber-50/20'
                    : 'border-slate-200/80 bg-white hover:border-indigo-200'}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {notice.pinned && <Pin className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                    <span className="font-semibold text-sm text-foreground">{notice.title}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tagColors[notice.tag] ?? tagColors.General}`}>
                      {notice.tag}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(notice.created_at), 'MMM d, yyyy')}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{notice.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {dealsByStage.length > 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
            <div className="mb-6">
              <h3 className="text-base font-bold text-slate-800">Deals by Stage</h3>
              <p className="text-xs text-slate-400 mt-0.5">All team deals · pipeline distribution</p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dealsByStage} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="stage" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartStyle} cursor={{ fill: 'rgba(99,102,241,0.05)' }} />
                  <Bar dataKey="count" fill="#6366f1" radius={[6,6,0,0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : <EmptyChart title="Deals by Stage" />}

        {dealsByStage.length > 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
            <div className="mb-6">
              <h3 className="text-base font-bold text-slate-800">Pipeline Distribution</h3>
              <p className="text-xs text-slate-400 mt-0.5">Value by stage</p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={dealsByStage} cx="50%" cy="50%"
                  innerRadius={70} outerRadius={110} paddingAngle={3}
                  dataKey="count" nameKey="stage" strokeWidth={0}
                >
                  {dealsByStage.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => `${v} deals`} contentStyle={chartStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-4 mt-4 pb-4">
              {dealsByStage.map((item, i) => (
                <div key={item.stage} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-muted-foreground">{item.stage}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <EmptyChart title="Pipeline Distribution" />}
      </div>

      {/* CTA */}
      <div className="bg-gradient-to-r from-indigo-500/5 via-violet-500/10 to-indigo-500/5 rounded-2xl p-6 border border-indigo-100">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <h3 className="font-semibold text-foreground">Ready to grow your pipeline?</h3>
            <p className="text-sm text-muted-foreground">Add new leads and start converting them into deals.</p>
          </div>
          <div className="flex gap-3">
            <a href="/leads"
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-xl
                bg-gradient-to-br from-indigo-500 to-violet-600 text-white
                hover:from-indigo-600 hover:to-violet-700 transition-all shadow-sm shadow-indigo-200">
              Add Lead
            </a>
            <a href="/pipeline"
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-xl
                border border-slate-200 bg-white hover:bg-slate-50
                hover:border-indigo-200 hover:text-indigo-600 transition-all">
              View Pipeline
            </a>
          </div>
        </div>
      </div>

    </div>
  );
}