/**
 * pages/TeamPerformance.tsx
 *
 * Team Performance Analytics — admin/manager only.
 *
 * Aggregates across 5 data sources per team member:
 *   1. time_entries   → hours logged (billable vs non-billable)
 *   2. deals          → revenue won + active pipeline
 *   3. activities     → calls, emails, meetings, follow-ups logged
 *   4. project_tasks  → tasks completed (assignee_id, status=done)
 *   5. tickets        → support tickets resolved
 *
 * Views:
 *   - Overview leaderboard (sortable)
 *   - Individual member drill-down card
 *   - Time range filter: 7d / 30d / 90d / all
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { PageLoader } from '@/components/PageLoader';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  Users, Clock, DollarSign, CheckCircle2, Ticket,
  Activity, TrendingUp, TrendingDown, Minus,
  ChevronUp, ChevronDown, Award, Zap,
  Calendar, BarChart3,
} from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MemberStats {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  // time
  hoursLogged: number;
  billableHours: number;
  // deals
  dealsWon: number;
  revenueWon: number;
  activeDeals: number;
  // activities
  activitiesLogged: number;
  callsMade: number;
  meetingsHeld: number;
  emailsSent: number;
  followUps: number;
  // tasks
  tasksCompleted: number;
  tasksTotal: number;
  // tickets
  ticketsResolved: number;
}

type SortKey = 'hoursLogged' | 'revenueWon' | 'dealsWon' | 'activitiesLogged' | 'tasksCompleted' | 'ticketsResolved';
type TimeRange = '7d' | '30d' | '90d' | 'all';

const RANGE_LABELS: Record<TimeRange, string> = {
  '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', 'all': 'All time',
};

const ROLE_CFG: Record<string, { pill: string }> = {
  admin:   { pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  manager: { pill: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  user:    { pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
};

const AVATAR_COLORS = [
  'from-indigo-400 to-indigo-600', 'from-sky-400 to-sky-600',
  'from-violet-400 to-violet-600', 'from-emerald-400 to-emerald-600',
  'from-amber-400 to-amber-600',   'from-pink-400 to-pink-600',
  'from-teal-400 to-teal-600',     'from-rose-400 to-rose-600',
];

function avatarColor(email: string) {
  return AVATAR_COLORS[email.charCodeAt(0) % AVATAR_COLORS.length];
}

function initials(name: string | null, email: string) {
  if (name) return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return email[0].toUpperCase();
}

function fmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);
}

function fmtHours(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_1px_6px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.07)] transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-black tabular-nums text-slate-800">{value}</p>
      <p className="text-sm font-medium text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Rank badge ─────────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg" title="Top performer">🥇</span>;
  if (rank === 2) return <span className="text-lg" title="2nd place">🥈</span>;
  if (rank === 3) return <span className="text-lg" title="3rd place">🥉</span>;
  return <span className="text-xs font-bold text-slate-400 tabular-nums w-5 text-center">#{rank}</span>;
}

// ── Trend indicator ────────────────────────────────────────────────────────────

function Trend({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-semibold text-slate-400 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── Radar chart for individual member ─────────────────────────────────────────

function MemberRadar({ member, maxes }: { member: MemberStats; maxes: Record<string, number> }) {
  const data = [
    { metric: 'Hours',      value: maxes.hoursLogged     > 0 ? Math.round((member.hoursLogged     / maxes.hoursLogged)     * 100) : 0 },
    { metric: 'Revenue',    value: maxes.revenueWon      > 0 ? Math.round((member.revenueWon      / maxes.revenueWon)      * 100) : 0 },
    { metric: 'Activities', value: maxes.activitiesLogged > 0 ? Math.round((member.activitiesLogged / maxes.activitiesLogged) * 100) : 0 },
    { metric: 'Tasks',      value: maxes.tasksCompleted  > 0 ? Math.round((member.tasksCompleted  / maxes.tasksCompleted)  * 100) : 0 },
    { metric: 'Tickets',    value: maxes.ticketsResolved > 0 ? Math.round((member.ticketsResolved / maxes.ticketsResolved) * 100) : 0 },
    { metric: 'Deals',      value: maxes.dealsWon        > 0 ? Math.round((member.dealsWon        / maxes.dealsWon)        * 100) : 0 },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={data}>
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar
          dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15}
          strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }}
        />
        <Tooltip
          formatter={(v: number) => `${v}%`}
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '8px 12px' }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ── Member Detail Panel ────────────────────────────────────────────────────────

function MemberDetail({ member, maxes, onClose }: {
  member: MemberStats; maxes: Record<string, number>; onClose: () => void;
}) {
  const billablePct = member.hoursLogged > 0
    ? Math.round((member.billableHours / member.hoursLogged) * 100) : 0;
  const taskCompletionPct = member.tasksTotal > 0
    ? Math.round((member.tasksCompleted / member.tasksTotal) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-indigo-200/60 shadow-[0_8px_32px_rgba(99,102,241,0.12)] overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500/5 via-violet-500/8 to-indigo-500/5 px-6 py-5 border-b border-slate-100 flex items-center gap-4">
        <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${avatarColor(member.email)} flex items-center justify-center text-white text-sm font-bold shadow-md`}>
          {initials(member.full_name, member.email)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800">{member.full_name || member.email.split('@')[0]}</p>
          <p className="text-xs text-muted-foreground">{member.email}</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${(ROLE_CFG[member.role] ?? ROLE_CFG.user).pill}`}>
          {member.role}
        </span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors text-lg leading-none">×</button>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-3">Performance Profile</p>
          <MemberRadar member={member} maxes={maxes} />
        </div>

        {/* Stats grid */}
        <div className="space-y-4">
          {/* Time */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Time</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Total logged</span>
              <span className="font-bold text-slate-800">{fmtHours(member.hoursLogged * 60)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Billable</span>
              <span className="font-bold text-emerald-600">{fmtHours(member.billableHours * 60)} <span className="text-xs font-normal text-slate-400">({billablePct}%)</span></span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full" style={{ width: `${billablePct}%` }} />
            </div>
          </div>

          {/* Sales */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Sales</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Revenue won</span>
              <span className="font-bold text-slate-800">{fmt(member.revenueWon)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Deals won</span>
              <span className="font-bold text-slate-800">{member.dealsWon}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Active pipeline</span>
              <span className="font-semibold text-indigo-600">{member.activeDeals} deals</span>
            </div>
          </div>

          {/* Activity breakdown */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Activity</p>
            {[
              { label: 'Calls made',      value: member.callsMade,      color: 'text-sky-600' },
              { label: 'Meetings held',   value: member.meetingsHeld,   color: 'text-violet-600' },
              { label: 'Emails sent',     value: member.emailsSent,     color: 'text-amber-600' },
              { label: 'Follow-ups',      value: member.followUps,      color: 'text-orange-600' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{row.label}</span>
                <span className={`font-bold ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Tasks & tickets */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-center">
              <p className="text-xl font-black text-teal-600">{member.tasksCompleted}</p>
              <p className="text-xs text-slate-500">Tasks done</p>
              {member.tasksTotal > 0 && (
                <p className="text-[10px] text-slate-400 mt-0.5">{taskCompletionPct}% of assigned</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-center">
              <p className="text-xl font-black text-rose-600">{member.ticketsResolved}</p>
              <p className="text-xs text-slate-500">Tickets resolved</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TeamPerformance() {
  const { user, role, profile } = useAuth();
  const navigate = useNavigate();

  const [members,  setMembers]  = useState<MemberStats[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [range,    setRange]    = useState<TimeRange>('30d');
  const [sortBy,   setSortBy]   = useState<SortKey>('revenueWon');
  const [sortDir,  setSortDir]  = useState<'desc' | 'asc'>('desc');
  const [selected, setSelected] = useState<string | null>(null);

  // Gate: admin + manager only
  useEffect(() => {
    if (role && role !== 'admin' && role !== 'manager') {
      navigate('/dashboard', { replace: true });
    }
  }, [role, navigate]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user || (role !== 'admin' && role !== 'manager')) return;
    fetchAll();
  }, [user, role, range]);

  const fetchAll = async () => {
    setLoading(true);

    const since = range === 'all'
      ? new Date('2020-01-01').toISOString()
      : startOfDay(subDays(new Date(), Number(range.replace('d', '')))).toISOString();

    // 1. All org profiles
    const { data: profilesData } = await (supabase as any)
      .from('profiles')
      .select('id, email, full_name, role')
      .not('role', 'eq', 'investor')
      .not('role', 'eq', 'client')
      .order('email');

    const profiles: { id: string; email: string; full_name: string | null; role: string }[] =
      (profilesData ?? []) as any[];

    if (profiles.length === 0) { setLoading(false); return; }
    const ids = profiles.map(p => p.id);

    // 2. Fetch all data in parallel
    const [timeRes, dealsRes, activitiesRes, tasksAllRes, tasksDoneRes, ticketsRes] = await Promise.all([
      // Time entries: sum by user
      (supabase as any)
        .from('time_entries')
        .select('user_id, duration_minutes, is_billable')
        .in('user_id', ids)
        .gte('created_at', since),

      // Deals: stage + value per creator
      (supabase as any)
        .from('deals')
        .select('created_by, stage, value')
        .in('created_by', ids)
        .gte('created_at', since),

      // Activities: type + status per creator
      (supabase as any)
        .from('activities')
        .select('created_by, type, status')
        .in('created_by', ids)
        .gte('created_at', since),

      // Tasks: all assigned (for total count)
      (supabase as any)
        .from('project_tasks')
        .select('assignee_id, status')
        .in('assignee_id', ids),

      // Tasks: done (for completed count in range)
      (supabase as any)
        .from('project_tasks')
        .select('assignee_id')
        .in('assignee_id', ids)
        .eq('status', 'done')
        .gte('created_at', since),

      // Tickets: resolved per creator
      (supabase as any)
        .from('tickets')
        .select('created_by, status')
        .in('created_by', ids)
        .in('status', ['resolved', 'closed'])
        .gte('created_at', since),
    ]);

    const timeEntries:  any[] = timeRes.data      ?? [];
    const deals:        any[] = dealsRes.data      ?? [];
    const activities:   any[] = activitiesRes.data ?? [];
    const tasksAll:     any[] = tasksAllRes.data   ?? [];
    const tasksDone:    any[] = tasksDoneRes.data  ?? [];
    const tickets:      any[] = ticketsRes.data    ?? [];

    // 3. Aggregate per member
    const stats: MemberStats[] = profiles.map(p => {
      // Time
      const myTime = timeEntries.filter(t => t.user_id === p.id);
      const hoursLogged   = Math.round(myTime.reduce((s, t) => s + (t.duration_minutes ?? 0), 0)) / 60;
      const billableHours = Math.round(myTime.filter(t => t.is_billable).reduce((s, t) => s + (t.duration_minutes ?? 0), 0)) / 60;

      // Deals
      const myDeals    = deals.filter(d => d.created_by === p.id);
      const wonDeals   = myDeals.filter(d => d.stage === 'won');
      const revenueWon = wonDeals.reduce((s, d) => s + Number(d.value || 0), 0);
      const activeDeals = myDeals.filter(d => !['won','lost'].includes(d.stage ?? '')).length;

      // Activities
      const myActs = activities.filter(a => a.created_by === p.id);
      const callsMade    = myActs.filter(a => a.type === 'call').length;
      const meetingsHeld = myActs.filter(a => a.type === 'meeting').length;
      const emailsSent   = myActs.filter(a => a.type === 'email').length;
      const followUps    = myActs.filter(a => a.type === 'follow_up').length;

      // Tasks
      const myTasksAll  = tasksAll.filter(t => t.assignee_id === p.id);
      const myTasksDone = tasksDone.filter(t => t.assignee_id === p.id);

      // Tickets
      const ticketsResolved = tickets.filter(t => t.created_by === p.id).length;

      return {
        id: p.id, email: p.email, full_name: p.full_name, role: p.role,
        hoursLogged: parseFloat(hoursLogged.toFixed(1)),
        billableHours: parseFloat(billableHours.toFixed(1)),
        dealsWon: wonDeals.length, revenueWon, activeDeals,
        activitiesLogged: myActs.length, callsMade, meetingsHeld, emailsSent, followUps,
        tasksCompleted: myTasksDone.length, tasksTotal: myTasksAll.length,
        ticketsResolved,
      };
    });

    setMembers(stats);
    setLoading(false);
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const sorted = useMemo(() => {
    return [...members].sort((a, b) => {
      const diff = a[sortBy] - b[sortBy];
      return sortDir === 'desc' ? -diff : diff;
    });
  }, [members, sortBy, sortDir]);

  const maxes = useMemo(() => ({
    hoursLogged:      Math.max(...members.map(m => m.hoursLogged), 1),
    revenueWon:       Math.max(...members.map(m => m.revenueWon), 1),
    dealsWon:         Math.max(...members.map(m => m.dealsWon), 1),
    activitiesLogged: Math.max(...members.map(m => m.activitiesLogged), 1),
    tasksCompleted:   Math.max(...members.map(m => m.tasksCompleted), 1),
    ticketsResolved:  Math.max(...members.map(m => m.ticketsResolved), 1),
  }), [members]);

  // Team-wide totals
  const totals = useMemo(() => ({
    hours:      members.reduce((s, m) => s + m.hoursLogged, 0).toFixed(1),
    revenue:    members.reduce((s, m) => s + m.revenueWon, 0),
    activities: members.reduce((s, m) => s + m.activitiesLogged, 0),
    tasks:      members.reduce((s, m) => s + m.tasksCompleted, 0),
    tickets:    members.reduce((s, m) => s + m.ticketsResolved, 0),
    deals:      members.reduce((s, m) => s + m.dealsWon, 0),
  }), [members]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortBy !== k) return <ChevronUp className="h-3 w-3 opacity-20" />;
    return sortDir === 'desc'
      ? <ChevronDown className="h-3 w-3 text-indigo-500" />
      : <ChevronUp className="h-3 w-3 text-indigo-500" />;
  };

  const selectedMember = members.find(m => m.id === selected) ?? null;

  const chartStyle = {
    backgroundColor: '#fff', border: '1px solid #e2e8f0',
    borderRadius: '12px', padding: '8px 12px',
  };

  // Bar chart data
  const barData = sorted.slice(0, 8).map(m => ({
    name: (m.full_name || m.email.split('@')[0]).split(' ')[0],
    Hours:      m.hoursLogged,
    Revenue:    Math.round(m.revenueWon / 1000),
    Activities: m.activitiesLogged,
    Tasks:      m.tasksCompleted,
  }));

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-indigo-600" />
            Team Performance
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {members.length} team members · {RANGE_LABELS[range]}
          </p>
        </div>

        {/* Time range chips */}
        <div className="flex items-center gap-1.5">
          {(['7d','30d','90d','all'] as TimeRange[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ring-1
                ${range === r
                  ? 'bg-indigo-600 text-white ring-indigo-600 shadow-sm'
                  : 'bg-white text-slate-500 ring-slate-200 hover:ring-indigo-200 hover:text-indigo-600'}`}
            >
              {r === 'all' ? 'All time' : r}
            </button>
          ))}
        </div>
      </div>

      {/* ── Team totals ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total hours"      value={totals.hours}               sub="logged"       icon={Clock}        color="bg-indigo-50 text-indigo-600" />
        <StatCard label="Revenue won"      value={fmt(totals.revenue)}        sub="from deals"   icon={DollarSign}   color="bg-emerald-50 text-emerald-600" />
        <StatCard label="Deals won"        value={totals.deals}               sub="closed"       icon={TrendingUp}   color="bg-violet-50 text-violet-600" />
        <StatCard label="Activities"       value={totals.activities}          sub="logged"       icon={Activity}     color="bg-sky-50 text-sky-600" />
        <StatCard label="Tasks completed"  value={totals.tasks}               sub="done"         icon={CheckCircle2} color="bg-teal-50 text-teal-600" />
        <StatCard label="Tickets resolved" value={totals.tickets}             sub="closed"       icon={Ticket}       color="bg-rose-50 text-rose-600" />
      </div>

      {/* ── Bar chart ── */}
      {barData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-bold text-slate-800">Activity Comparison</h3>
              <p className="text-xs text-slate-400 mt-0.5">Top 8 members · Hours, Activities & Tasks</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-indigo-400 inline-block" />Hours</span>
              <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-amber-400 inline-block" />Activities</span>
              <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-teal-400 inline-block" />Tasks</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} barCategoryGap="20%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={chartStyle} />
              <Bar dataKey="Hours"      fill="#6366f1" radius={[4,4,0,0]} maxBarSize={20} />
              <Bar dataKey="Activities" fill="#f59e0b" radius={[4,4,0,0]} maxBarSize={20} />
              <Bar dataKey="Tasks"      fill="#14b8a6" radius={[4,4,0,0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Selected member detail ── */}
      {selectedMember && (
        <MemberDetail
          member={selectedMember}
          maxes={maxes}
          onClose={() => setSelected(null)}
        />
      )}

      {/* ── Leaderboard table ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-500" />
            Leaderboard
          </h3>
          <p className="text-xs text-muted-foreground">Click a row to view details · click column headers to sort</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-8">#</th>
                <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member</th>

                {([
                  { key: 'hoursLogged',      label: 'Hours' },
                  { key: 'revenueWon',       label: 'Revenue' },
                  { key: 'dealsWon',         label: 'Deals Won' },
                  { key: 'activitiesLogged', label: 'Activities' },
                  { key: 'tasksCompleted',   label: 'Tasks Done' },
                  { key: 'ticketsResolved',  label: 'Tickets' },
                ] as { key: SortKey; label: string }[]).map(col => (
                  <th
                    key={col.key}
                    className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-indigo-600 transition-colors hidden sm:table-cell"
                    onClick={() => toggleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      <SortIcon k={col.key} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-muted-foreground">
                    No data for this period
                  </td>
                </tr>
              )}
              {sorted.map((m, idx) => {
                const isSelected = selected === m.id;
                return (
                  <tr
                    key={m.id}
                    onClick={() => setSelected(isSelected ? null : m.id)}
                    className={`border-t border-slate-100 cursor-pointer transition-all
                      ${isSelected
                        ? 'bg-indigo-50/60 border-l-2 border-l-indigo-400'
                        : 'hover:bg-slate-50/60'}`}
                  >
                    {/* Rank */}
                    <td className="p-3 pl-4">
                      <RankBadge rank={idx + 1} />
                    </td>

                    {/* Member */}
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-8 w-8 rounded-full bg-gradient-to-br ${avatarColor(m.email)} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
                          {initials(m.full_name, m.email)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 text-[13px] truncate">
                            {m.full_name || m.email.split('@')[0]}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">{m.email}</p>
                        </div>
                        <span className={`hidden lg:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${(ROLE_CFG[m.role] ?? ROLE_CFG.user).pill}`}>
                          {m.role}
                        </span>
                      </div>
                    </td>

                    {/* Hours */}
                    <td className="p-3 hidden sm:table-cell">
                      <p className="font-semibold text-slate-800 text-[13px]">{m.hoursLogged}h</p>
                      <p className="text-[10px] text-emerald-500">{m.billableHours}h billable</p>
                      <Trend value={m.hoursLogged} max={maxes.hoursLogged} />
                    </td>

                    {/* Revenue */}
                    <td className="p-3 hidden sm:table-cell">
                      <p className="font-semibold text-slate-800 text-[13px]">{fmt(m.revenueWon)}</p>
                      <p className="text-[10px] text-slate-400">{m.activeDeals} active</p>
                      <Trend value={m.revenueWon} max={maxes.revenueWon} />
                    </td>

                    {/* Deals won */}
                    <td className="p-3 hidden sm:table-cell">
                      <p className="font-semibold text-slate-800 text-[13px]">{m.dealsWon}</p>
                      <Trend value={m.dealsWon} max={maxes.dealsWon} />
                    </td>

                    {/* Activities */}
                    <td className="p-3 hidden sm:table-cell">
                      <p className="font-semibold text-slate-800 text-[13px]">{m.activitiesLogged}</p>
                      <p className="text-[10px] text-slate-400">{m.callsMade}c {m.meetingsHeld}m {m.emailsSent}e</p>
                      <Trend value={m.activitiesLogged} max={maxes.activitiesLogged} />
                    </td>

                    {/* Tasks */}
                    <td className="p-3 hidden sm:table-cell">
                      <p className="font-semibold text-slate-800 text-[13px]">{m.tasksCompleted}</p>
                      {m.tasksTotal > 0 && (
                        <p className="text-[10px] text-slate-400">of {m.tasksTotal}</p>
                      )}
                      <Trend value={m.tasksCompleted} max={maxes.tasksCompleted} />
                    </td>

                    {/* Tickets */}
                    <td className="p-3 hidden sm:table-cell">
                      <p className="font-semibold text-slate-800 text-[13px]">{m.ticketsResolved}</p>
                      <Trend value={m.ticketsResolved} max={maxes.ticketsResolved} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile member cards ── */}
      <div className="space-y-3 sm:hidden">
        {sorted.map((m, idx) => (
          <div
            key={m.id}
            onClick={() => setSelected(selected === m.id ? null : m.id)}
            className={`bg-white rounded-xl border p-4 cursor-pointer transition-all
              ${selected === m.id ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200/80'}`}
          >
            <div className="flex items-center gap-3 mb-3">
              <RankBadge rank={idx + 1} />
              <div className={`h-9 w-9 rounded-full bg-gradient-to-br ${avatarColor(m.email)} flex items-center justify-center text-white text-xs font-bold shadow-sm`}>
                {initials(m.full_name, m.email)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">
                  {m.full_name || m.email.split('@')[0]}
                </p>
                <p className="text-xs text-muted-foreground">{m.role}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-50 rounded-lg p-2">
                <p className="font-bold text-slate-800 text-sm">{m.hoursLogged}h</p>
                <p className="text-[10px] text-slate-400">Hours</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-2">
                <p className="font-bold text-emerald-600 text-sm">{fmt(m.revenueWon)}</p>
                <p className="text-[10px] text-slate-400">Revenue</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-2">
                <p className="font-bold text-indigo-600 text-sm">{m.activitiesLogged}</p>
                <p className="text-[10px] text-slate-400">Activities</p>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}