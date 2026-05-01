/**
 * pages/TimeTracking.tsx — Redesigned for multi-project teams
 *
 * KEY CHANGES from v1:
 * 1. MULTI-TIMER: run timers for multiple projects simultaneously.
 *    Each project gets its own timer card — start/stop independently.
 * 2. DURATION BUG FIX: duration now calculated client-side on display,
 *    not just from the stored column (which may be null if DB write fails).
 * 3. QUICK LOG: manually log time without using the timer (for past work).
 * 4. Better weekly chart with project breakdown.
 *
 * DB: same table as before — no migration needed.
 * Route: /time-tracking
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PageLoader } from '@/components/PageLoader';
import { Play, Square, DollarSign, Pencil, Trash2, BarChart2, Plus, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, differenceInSeconds } from 'date-fns';
import { exportToCSV } from '@/utils/export';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimeEntry {
  id: string; user_id: string; project_id: string | null;
  description: string | null; start_time: string; end_time: string | null;
  is_billable: boolean; duration_minutes: number | null; created_at: string;
  project_name?: string | null; user_email?: string | null;
}

interface Project { id: string; name: string; color?: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

// Computes duration in minutes — uses DB value if available, otherwise calculates live
function getDurationMinutes(entry: TimeEntry): number {
  if (entry.end_time) {
    if (entry.duration_minutes && entry.duration_minutes > 0) return entry.duration_minutes;
    // Fallback: calculate from timestamps
    return Math.floor((new Date(entry.end_time).getTime() - new Date(entry.start_time).getTime()) / 60000);
  }
  // Running timer — compute live
  return Math.floor((Date.now() - new Date(entry.start_time).getTime()) / 60000);
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function formatElapsed(startTimeISO: string): string {
  const secs = Math.floor((Date.now() - new Date(startTimeISO).getTime()) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

const PROJECT_COLORS = ['#6366f1','#10b981','#f59e0b','#ec4899','#0ea5e9','#8b5cf6','#f97316','#14b8a6'];

// ── Live timer display (updates every second) ─────────────────────────────────

function LiveTimer({ startTime }: { startTime: string }) {
  const [display, setDisplay] = useState(() => formatElapsed(startTime));
  useEffect(() => {
    const id = setInterval(() => setDisplay(formatElapsed(startTime)), 1000);
    return () => clearInterval(id);
  }, [startTime]);
  return <span className="font-mono text-3xl font-black text-indigo-600 tabular-nums tracking-tight">{display}</span>;
}

// ── Running timer card (one per active entry) ─────────────────────────────────

function RunningTimerCard({
  entry, projectName, onStop,
}: { entry: TimeEntry; projectName: string | null; onStop: (id: string) => void }) {
  return (
    <div className="flex items-center gap-4 bg-white border border-indigo-200 rounded-2xl p-4 shadow-[0_2px_12px_rgba(99,102,241,0.08)]">
      <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800">{projectName ?? 'No project'}</span>
          {entry.description && <span className="text-sm text-muted-foreground truncate max-w-[200px]">· {entry.description}</span>}
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${entry.is_billable ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}`}>
            <DollarSign className="h-2.5 w-2.5" />{entry.is_billable ? 'Billable' : 'Non-bill.'}
          </span>
        </div>
        <LiveTimer startTime={entry.start_time} />
      </div>
      <Button onClick={() => onStop(entry.id)} className="bg-red-500 hover:bg-red-600 text-white shrink-0 gap-1.5">
        <Square className="h-3.5 w-3.5" />Stop
      </Button>
    </div>
  );
}

// ── Weekly chart ──────────────────────────────────────────────────────────────

function WeeklyChart({ entries }: { entries: TimeEntry[] }) {
  const weekDays = eachDayOfInterval({
    start: startOfWeek(new Date(), { weekStartsOn: 1 }),
    end:   endOfWeek(new Date(),   { weekStartsOn: 1 }),
  });
  const data = weekDays.map(day => {
    const dayStr  = format(day, 'yyyy-MM-dd');
    const dayEnts = entries.filter(e => e.end_time && format(new Date(e.start_time), 'yyyy-MM-dd') === dayStr);
    const billable = dayEnts.filter(e => e.is_billable).reduce((s, e) => s + getDurationMinutes(e), 0);
    const nonBill  = dayEnts.filter(e => !e.is_billable).reduce((s, e) => s + getDurationMinutes(e), 0);
    return { day: format(day, 'EEE'), billable: Math.round((billable / 60) * 10) / 10, nonBill: Math.round((nonBill / 60) * 10) / 10 };
  });
  const chartStyle = { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 14px' };
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} barCategoryGap="25%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={v => `${v}h`} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v: number) => `${v}h`} contentStyle={chartStyle} />
        <Legend formatter={v => v === 'billable' ? 'Billable' : 'Non-billable'} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="billable" fill="#10b981" radius={[4,4,0,0]} />
        <Bar dataKey="nonBill"  fill="#cbd5e1" radius={[4,4,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TimeTracking() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const { canManage } = usePermissions('time_tracking');

  const [entries,      setEntries]      = useState<TimeEntry[]>([]);
  const [projects,     setProjects]     = useState<Project[]>([]);
  const [members,      setMembers]      = useState<{ id: string; email: string }[]>([]);
  const [loading,      setLoading]      = useState(true);

  // New timer form (start a new timer)
  const [newProject,  setNewProject]   = useState('__none__');
  const [newDesc,     setNewDesc]       = useState('');
  const [newBillable, setNewBillable]   = useState(true);
  const [starting,    setStarting]      = useState(false);

  // Manual log form
  const [logOpen,     setLogOpen]       = useState(false);
  const [logProject,  setLogProject]    = useState('__none__');
  const [logDesc,     setLogDesc]       = useState('');
  const [logHours,    setLogHours]      = useState('');
  const [logMins,     setLogMins]       = useState('');
  const [logBillable, setLogBillable]   = useState(true);
  const [logDate,     setLogDate]       = useState(format(new Date(), 'yyyy-MM-dd'));

  // Filters
  const [filterProject, setFilterProject] = useState('__all__');
  const [filterUser,    setFilterUser]    = useState('__all__');
  const [filterFrom,    setFilterFrom]    = useState('');
  const [filterTo,      setFilterTo]      = useState('');

  // Inline edit
  const [editingId, setEditingId]  = useState<string | null>(null);
  const [editDesc,  setEditDesc]   = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user) return;
    const [{ data: proj }, { data: mem }] = await Promise.all([
      (supabase as any).from('projects').select('id, name').order('name'),
      (supabase as any).from('profiles').select('id, email').order('email'),
    ]);
    setProjects(proj ?? []);
    setMembers(mem ?? []);

    let q = (supabase as any)
      .from('time_entries')
      .select('*, projects:project_id(name), profiles:user_id(email)')
      .order('start_time', { ascending: false });

    if (role === 'user') q = q.eq('user_id', user.id);
    if (filterProject !== '__all__') q = q.eq('project_id', filterProject);
    if (filterUser    !== '__all__') q = q.eq('user_id', filterUser);
    if (filterFrom) q = q.gte('start_time', `${filterFrom}T00:00:00`);
    if (filterTo)   q = q.lte('start_time', `${filterTo}T23:59:59`);

    const { data, error } = await q;
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); }
    else {
      setEntries(((data ?? []) as any[]).map((e: any) => ({
        ...e,
        project_name: e.projects?.name ?? null,
        user_email:   e.profiles?.email ?? null,
      })));
    }
    setLoading(false);
  }, [user, role, filterProject, filterUser, filterFrom, filterTo]);

  useEffect(() => { loadData(); }, [loadData]);

  // Running entries for THIS user (there can be multiple — one per project)
  const runningEntries = entries.filter(e => !e.end_time && e.user_id === user?.id);
  const completedEntries = entries.filter(e => !!e.end_time);

  // ── Start timer ───────────────────────────────────────────────────────────
  // Prevent starting a second timer on the same project
  const handleStart = async () => {
    if (!user) return;

    const alreadyRunning = runningEntries.find(
      e => (e.project_id ?? '__none__') === (newProject === '__none__' ? '__none__' : newProject)
    );
    if (alreadyRunning) {
      toast({ variant: 'destructive', title: 'Timer already running for this project', description: 'Stop it first, or start a timer for a different project.' });
      return;
    }

    setStarting(true);
    const { data, error } = await (supabase as any).from('time_entries').insert([{
      user_id:     user.id,
      project_id:  newProject === '__none__' ? null : newProject,
      description: newDesc.trim() || null,
      is_billable: newBillable,
      start_time:  new Date().toISOString(),
    }]).select().single();

    if (error) { toast({ variant: 'destructive', title: 'Failed to start timer', description: error.message }); }
    else {
      const pName = projects.find(p => p.id === newProject)?.name ?? 'No project';
      toast({ title: `▶ Timer started — ${pName}` });
      setNewDesc('');
      setNewProject('__none__');
      loadData();
    }
    setStarting(false);
  };

  // ── Stop timer ────────────────────────────────────────────────────────────
  const handleStop = async (entryId: string) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    const endTime = new Date();
    // Calculate duration server-side too — but compute client-side as fallback
    const durationMinutes = Math.max(1, Math.floor(
      (endTime.getTime() - new Date(entry.start_time).getTime()) / 60000
    ));

    const { error } = await (supabase as any).from('time_entries').update({
      end_time:         endTime.toISOString(),
      duration_minutes: durationMinutes,
    }).eq('id', entryId);

    if (error) { toast({ variant: 'destructive', title: 'Failed to stop', description: error.message }); return; }
    toast({ title: `⏹ ${formatDuration(durationMinutes)} logged`, description: entry.project_name ?? undefined });
    loadData();
  };

  // ── Manual log ────────────────────────────────────────────────────────────
  const handleManualLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const totalMins = (Number(logHours) * 60) + Number(logMins);
    if (totalMins <= 0) { toast({ variant: 'destructive', title: 'Enter a duration' }); return; }

    const startTime = new Date(`${logDate}T09:00:00`);
    const endTime   = new Date(startTime.getTime() + totalMins * 60000);

    const { error } = await (supabase as any).from('time_entries').insert([{
      user_id:          user.id,
      project_id:       logProject === '__none__' ? null : logProject,
      description:      logDesc.trim() || null,
      start_time:       startTime.toISOString(),
      end_time:         endTime.toISOString(),
      duration_minutes: totalMins,
      is_billable:      logBillable,
    }]);

    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
    toast({ title: `${formatDuration(totalMins)} logged manually` });
    setLogOpen(false);
    setLogHours(''); setLogMins(''); setLogDesc(''); setLogProject('__none__');
    loadData();
  };

  // ── Toggle billable ───────────────────────────────────────────────────────
  const toggleBillable = async (entry: TimeEntry) => {
    await (supabase as any).from('time_entries').update({ is_billable: !entry.is_billable }).eq('id', entry.id);
    loadData();
  };

  // ── Edit / Delete ─────────────────────────────────────────────────────────
  const saveEdit = async (id: string) => {
    await (supabase as any).from('time_entries').update({ description: editDesc.trim() || null }).eq('id', id);
    setEditingId(null); toast({ title: 'Updated' }); loadData();
  };

  const deleteEntry = async (id: string) => {
    await (supabase as any).from('time_entries').delete().eq('id', id);
    toast({ title: 'Deleted' }); loadData();
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(now,   { weekStartsOn: 1 });
  const thisWeek  = completedEntries.filter(e => { const d = new Date(e.start_time); return d >= weekStart && d <= weekEnd; });
  const totalMins    = thisWeek.reduce((s, e) => s + getDurationMinutes(e), 0);
  const billableMins = thisWeek.filter(e => e.is_billable).reduce((s, e) => s + getDurationMinutes(e), 0);
  const nonBillMins  = totalMins - billableMins;

  // Per-project this week
  const byProject = projects.map(p => {
    const pEntries = thisWeek.filter(e => e.project_id === p.id);
    const mins = pEntries.reduce((s, e) => s + getDurationMinutes(e), 0);
    return { name: p.name, mins, formatted: formatDuration(mins) };
  }).filter(p => p.mins > 0).sort((a, b) => b.mins - a.mins);

  const { paginatedData: paged, paginationProps } = usePagination(completedEntries, 20);

  if (loading) return <PageLoader />;

  const isProjectRunning = (projectId: string | null) =>
    runningEntries.some(e => (e.project_id ?? null) === (projectId === '__none__' ? null : projectId));

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Time Tracking</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Track billable hours across multiple projects simultaneously</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={logOpen} onOpenChange={setLogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Plus className="h-4 w-4 mr-2" />Log time manually</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Log time manually</DialogTitle></DialogHeader>
              <form onSubmit={handleManualLog} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Hours</Label>
                    <Input type="number" min="0" max="24" placeholder="0" value={logHours} onChange={e => setLogHours(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Minutes</Label>
                    <Input type="number" min="0" max="59" placeholder="0" value={logMins} onChange={e => setLogMins(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Project</Label>
                  <Select value={logProject} onValueChange={setLogProject}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No project</SelectItem>
                      {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input placeholder="What did you work on?" value={logDesc} onChange={e => setLogDesc(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={logBillable ? 'billable' : 'nonbill'} onValueChange={v => setLogBillable(v === 'billable')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="billable">💰 Billable</SelectItem>
                      <SelectItem value="nonbill">🔧 Non-billable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setLogOpen(false)}>Cancel</Button>
                  <Button type="submit">Log time</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={() => {
            const rows = completedEntries.map(e => ({ Date: format(new Date(e.start_time), 'yyyy-MM-dd'), User: e.user_email ?? '', Project: e.project_name ?? '—', Description: e.description ?? '', Duration: formatDuration(getDurationMinutes(e)), Billable: e.is_billable ? 'Yes' : 'No' }));
            exportToCSV('time_entries', rows);
            toast({ title: `Exported ${rows.length} entries` });
          }} disabled={completedEntries.length === 0}>Export CSV</Button>
        </div>
      </div>

      {/* ── Running timers ── */}
      {runningEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse inline-block" />
            {runningEntries.length} timer{runningEntries.length > 1 ? 's' : ''} running
          </p>
          {runningEntries.map(entry => (
            <RunningTimerCard key={entry.id} entry={entry} projectName={entry.project_name} onStop={handleStop} />
          ))}
        </div>
      )}

      {/* ── Start new timer ── */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-indigo-500" />Start a new timer
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div className="space-y-1 sm:col-span-1">
            <Label className="text-xs">Project</Label>
            <Select value={newProject} onValueChange={setNewProject}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No project</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id} disabled={isProjectRunning(p.id)}>
                    {p.name}{isProjectRunning(p.id) ? ' (running)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">What are you working on?</Label>
            <Input
              placeholder="e.g. Frontend redesign, bug fix, client call…"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleStart(); }}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={newBillable ? 'billable' : 'nonbill'} onValueChange={v => setNewBillable(v === 'billable')}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="billable">💰 Billable</SelectItem>
                <SelectItem value="nonbill">🔧 Non-billable</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          className="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          onClick={handleStart}
          disabled={starting || isProjectRunning(newProject)}
        >
          <Play className="h-4 w-4" />
          {isProjectRunning(newProject) ? 'Already running for this project' : 'Start timer'}
        </Button>
        {projects.length > 1 && (
          <p className="text-xs text-muted-foreground mt-2">
            You can run timers for multiple projects at the same time.
            {runningEntries.length > 0 && ` ${runningEntries.length} currently running.`}
          </p>
        )}
      </div>

      {/* ── Weekly summary ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">This week</h2>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Total',     value: formatDuration(totalMins),    color: 'text-slate-800'   },
              { label: 'Billable',  value: formatDuration(billableMins), color: 'text-emerald-600' },
              { label: 'Non-bill.', value: formatDuration(nonBillMins),  color: 'text-slate-500'   },
            ].map(s => (
              <div key={s.label} className="bg-white border border-slate-200/80 rounded-xl p-3 text-center shadow-sm">
                <p className={`text-sm font-black tabular-nums ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          {/* Per-project breakdown */}
          {byProject.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-xl p-3 space-y-2 shadow-sm">
              <p className="text-xs font-semibold text-muted-foreground">By project</p>
              {byProject.map((p, i) => (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: PROJECT_COLORS[i % PROJECT_COLORS.length] }} />
                  <span className="text-xs flex-1 text-slate-700 truncate">{p.name}</span>
                  <span className="text-xs font-semibold tabular-nums text-slate-600">{p.formatted}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
            <BarChart2 className="h-3.5 w-3.5" />Weekly breakdown (hours)
          </p>
          <WeeklyChart entries={completedEntries} />
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Project</Label>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All projects" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All projects</SelectItem>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <div className="space-y-1">
            <Label className="text-xs">Team member</Label>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="All members" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All members</SelectItem>
                {members.map(m => <SelectItem key={m.id} value={m.id}>{m.email.split('@')[0]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="h-8 text-xs w-36" /></div>
        <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="h-8 text-xs w-36" /></div>
        {(filterProject !== '__all__' || filterUser !== '__all__' || filterFrom || filterTo) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterProject('__all__'); setFilterUser('__all__'); setFilterFrom(''); setFilterTo(''); }}>Clear</Button>
        )}
      </div>

      {/* ── Log table ── */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-x-auto shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
              {canManage && <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">User</th>}
              <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Project</th>
              <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
              <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Duration</th>
              <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
              <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && <tr><td colSpan={canManage ? 7 : 6} className="p-10 text-center text-muted-foreground">No time entries yet. Start a timer or log time manually.</td></tr>}
            {paged.map(entry => {
              const mins = getDurationMinutes(entry);
              return (
                <tr key={entry.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{format(new Date(entry.start_time), 'MMM d, yyyy')}</td>
                  {canManage && <td className="p-3 hidden md:table-cell"><span className="text-xs text-slate-600">{entry.user_email?.split('@')[0] ?? '—'}</span></td>}
                  <td className="p-3">
                    {entry.project_name
                      ? <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 px-2 py-0.5 text-xs font-medium">{entry.project_name}</span>
                      : <span className="text-muted-foreground text-xs">—</span>
                    }
                  </td>
                  <td className="p-3 max-w-xs">
                    {editingId === entry.id ? (
                      <div className="flex items-center gap-2">
                        <Input autoFocus value={editDesc} onChange={e => setEditDesc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(entry.id); if (e.key === 'Escape') setEditingId(null); }} className="h-7 text-xs" />
                        <Button size="sm" className="h-7 text-xs px-2" onClick={() => saveEdit(entry.id)}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs px-1" onClick={() => setEditingId(null)}>✕</Button>
                      </div>
                    ) : (
                      <span className="text-slate-700 truncate block max-w-[200px]">{entry.description || <span className="text-muted-foreground italic text-xs">No description</span>}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {/* Duration shown even if DB column is null — computed from timestamps */}
                    <span className="font-mono text-sm font-semibold tabular-nums text-slate-700">
                      {mins > 0 ? formatDuration(mins) : <span className="text-muted-foreground">—</span>}
                    </span>
                    {/* Show "(calc)" if DB value was missing */}
                    {entry.end_time && (!entry.duration_minutes || entry.duration_minutes <= 0) && (
                      <span className="text-[10px] text-muted-foreground ml-1">(calc)</span>
                    )}
                  </td>
                  <td className="p-3">
                    <button onClick={() => toggleBillable(entry)} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 transition-all ${entry.is_billable ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 ring-slate-200 hover:bg-slate-200'}`}>
                      <DollarSign className="h-2.5 w-2.5" />{entry.is_billable ? 'Billable' : 'Non-bill.'}
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditingId(entry.id); setEditDesc(entry.description ?? ''); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => deleteEntry(entry.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PaginationControls {...paginationProps} />
    </div>
  );
}