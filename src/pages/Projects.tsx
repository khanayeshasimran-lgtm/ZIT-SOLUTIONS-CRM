import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirmDelete } from '@/hooks/useConfirmDelete';
import { logAudit } from '@/lib/audit';
import { PageLoader } from '@/components/PageLoader';
import { MobileCard } from '@/components/MobileCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/DataTable';
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/export';
import { ExportDropdown } from '@/components/ExportDropdown';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  FolderKanban, Plus, Trash2, Pencil, ChevronRight,
  ListTodo, CheckCircle2, Circle, Clock, Users, X,
  GripVertical, LayoutGrid,
} from 'lucide-react';
import { format } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'completed' | 'on_hold';
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  rating?: number | null;
}

type TaskStatus = 'todo' | 'in_progress' | 'done';

interface ProjectTask {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee_id: string | null;
  assignee_email?: string | null;
  due_date: string | null;
  parent_task_id: string | null;
  sprint_id: string | null;
  created_at: string;
}

interface TeamMember {
  id: string;
  email: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; pill: string; dot: string; accent: string }> = {
  active:    { label: 'Active',    pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-400', accent: '#10b981' },
  completed: { label: 'Completed', pill: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',             dot: 'bg-sky-400',     accent: '#0ea5e9' },
  on_hold:   { label: 'On Hold',   pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       dot: 'bg-amber-400',   accent: '#f59e0b' },
};

const TASK_STATUS_CFG: Record<TaskStatus, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  todo:        { label: 'To Do',       icon: Circle,       color: 'text-slate-400',  bg: 'bg-slate-50'   },
  in_progress: { label: 'In Progress', icon: Clock,        color: 'text-amber-500',  bg: 'bg-amber-50'   },
  done:        { label: 'Done',        icon: CheckCircle2, color: 'text-emerald-500',bg: 'bg-emerald-50' },
};

const AVATAR_COLORS = [
  'from-indigo-400 to-indigo-600', 'from-sky-400 to-sky-600',
  'from-violet-400 to-violet-600', 'from-emerald-400 to-emerald-600',
  'from-amber-400 to-amber-600',   'from-pink-400 to-pink-600',
];

function ProjectAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const color    = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
      {initials}
    </div>
  );
}

// ── Task kanban board (shown inside drawer) ───────────────────────────────────

interface TaskBoardProps {
  tasks: ProjectTask[];
  members: TeamMember[];
  projectId: string;
  onRefresh: () => void;
}

function TaskBoard({ tasks, members, projectId, onRefresh }: TaskBoardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [addingStatus, setAddingStatus] = useState<TaskStatus | null>(null);
  const [newTitle,     setNewTitle]     = useState('');
  const [newAssignee,  setNewAssignee]  = useState('__none__');

  const columns: TaskStatus[] = ['todo', 'in_progress', 'done'];

  const moveTask = async (taskId: string, newStatus: TaskStatus) => {
    const { error } = await (supabase as any)
      .from('project_tasks')
      .update({ status: newStatus })
      .eq('id', taskId);
    if (error) { toast({ variant: 'destructive', title: 'Failed to move task', description: error.message }); return; }
    onRefresh();
  };

  const deleteTask = async (taskId: string) => {
    await (supabase as any).from('project_tasks').delete().eq('id', taskId);
    onRefresh();
  };

  const addTask = async (status: TaskStatus) => {
    if (!newTitle.trim()) return;
    // '__none__' is the sentinel for "unassigned" — Radix Select disallows empty string values
    const assigneeId = newAssignee === '__none__' || !newAssignee ? null : newAssignee;
    const { error } = await (supabase as any).from('project_tasks').insert([{
      project_id:  projectId,
      title:       newTitle.trim(),
      status,
      assignee_id: assigneeId,
      created_by:  user?.id,
    }]);
    if (error) { toast({ variant: 'destructive', title: 'Failed to add task', description: error.message }); return; }
    setNewTitle('');
    setNewAssignee('__none__');
    setAddingStatus(null);
    onRefresh();
  };

  return (
    <div className="grid grid-cols-3 gap-3 min-h-[300px]">
      {columns.map(col => {
        const cfg        = TASK_STATUS_CFG[col];
        const Icon       = cfg.icon;
        const colTasks   = tasks.filter(t => t.status === col);
        const isAdding   = addingStatus === col;

        return (
          <div key={col} className="flex flex-col gap-2">
            {/* Column header */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                <span className="text-xs font-semibold text-slate-600">{cfg.label}</span>
                {colTasks.length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                    {colTasks.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => { setAddingStatus(col); setNewTitle(''); }}
                className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            {/* Task cards */}
            <div className={`flex-1 rounded-xl p-2 space-y-2 min-h-[200px] border border-dashed ${col === 'todo' ? 'border-slate-200 bg-slate-50/50' : col === 'in_progress' ? 'border-amber-200 bg-amber-50/30' : 'border-emerald-200 bg-emerald-50/30'}`}>
              {colTasks.map(task => (
                <div key={task.id}
                  className="bg-white rounded-lg border border-slate-200/80 p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] group"
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-xs font-medium text-slate-800 leading-snug flex-1">{task.title}</p>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-300 hover:text-red-400 transition-all shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {task.assignee_email && (
                    <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                      <Users className="h-2.5 w-2.5" />
                      {task.assignee_email.split('@')[0]}
                    </p>
                  )}
                  {task.due_date && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Due {format(new Date(task.due_date), 'MMM d')}
                    </p>
                  )}
                  {/* Quick move buttons */}
                  <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {columns.filter(c => c !== col).map(c => (
                      <button
                        key={c}
                        onClick={() => moveTask(task.id, c)}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                      >
                        → {TASK_STATUS_CFG[c].label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Inline add form */}
              {isAdding && (
                <div className="bg-white rounded-lg border border-indigo-200 p-2 space-y-1.5">
                  <Input
                    autoFocus
                    placeholder="Task title…"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addTask(col); if (e.key === 'Escape') setAddingStatus(null); }}
                    className="h-7 text-xs"
                  />
                  {members.length > 0 && (
                    <Select value={newAssignee} onValueChange={setNewAssignee}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {members.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => addTask(col)}>Add</Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setAddingStatus(null)}>Cancel</Button>
                  </div>
                </div>
              )}

              {colTasks.length === 0 && !isAdding && (
                <div className="flex items-center justify-center h-16 text-[11px] text-slate-300">
                  No tasks
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Task workload summary ─────────────────────────────────────────────────────

function WorkloadChart({ tasks, members }: { tasks: ProjectTask[]; members: TeamMember[] }) {
  const assignedMembers = members.filter(m =>
    tasks.some(t => t.assignee_id === m.id)
  );
  if (!assignedMembers.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" />Workload
      </p>
      {assignedMembers.map(m => {
        const memberTasks = tasks.filter(t => t.assignee_id === m.id);
        const done        = memberTasks.filter(t => t.status === 'done').length;
        const total       = memberTasks.length;
        const pct         = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <div key={m.id} className="space-y-0.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-600 truncate max-w-[120px]">{m.email.split('@')[0]}</span>
              <span className="text-slate-400">{done}/{total}</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Task drawer ───────────────────────────────────────────────────────────────

interface TaskDrawerProps {
  project: Project;
  onClose: () => void;
}

function TaskDrawer({ project, onClose }: TaskDrawerProps) {
  const { toast }   = useToast();
  const [tasks,     setTasks]   = useState<ProjectTask[]>([]);
  const [members,   setMembers] = useState<TeamMember[]>([]);
  const [loading,   setLoading] = useState(true);
  const [view,      setView]    = useState<'board' | 'list'>('board');

  const loadData = useCallback(async () => {
    const [{ data: taskData }, { data: memberData }] = await Promise.all([
      (supabase as any)
        .from('project_tasks')
        .select('*, profiles:assignee_id(email)')
        .eq('project_id', project.id)
        .order('created_at', { ascending: true }),
      (supabase as any)
        .from('profiles')
        .select('id, email')
        .order('email'),
    ]);

    const mapped = ((taskData ?? []) as any[]).map((t: any) => ({
      ...t,
      assignee_email: t.profiles?.email ?? null,
    }));

    setTasks(mapped as ProjectTask[]);
    setMembers((memberData ?? []) as TeamMember[]);
    setLoading(false);
  }, [project.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalTasks = tasks.length;
  const doneTasks  = tasks.filter(t => t.status === 'done').length;
  const progress   = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer panel */}
      <div className="w-full max-w-2xl bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden">

        {/* Drawer header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <ProjectAvatar name={project.name} />
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground truncate">{project.name}</h2>
              <p className="text-xs text-muted-foreground">
                {doneTasks}/{totalTasks} tasks done
                {totalTasks > 0 && ` · ${progress}% complete`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* View toggle */}
            <div className="flex items-center border rounded-lg overflow-hidden">
              <Button
                variant={view === 'board' ? 'default' : 'ghost'}
                size="sm" className="rounded-none h-8 px-2"
                onClick={() => setView('board')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={view === 'list' ? 'default' : 'ghost'}
                size="sm" className="rounded-none h-8 px-2"
                onClick={() => setView('list')}
              >
                <ListTodo className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        {totalTasks > 0 && (
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Loading tasks…
            </div>
          ) : (
            <>
              {view === 'board' && (
                <TaskBoard
                  tasks={tasks}
                  members={members}
                  projectId={project.id}
                  onRefresh={loadData}
                />
              )}

              {view === 'list' && (
                <div className="space-y-2">
                  {(['todo','in_progress','done'] as TaskStatus[]).map(status => {
                    const cfg       = TASK_STATUS_CFG[status];
                    const Icon      = cfg.icon;
                    const colTasks  = tasks.filter(t => t.status === status);
                    if (!colTasks.length) return null;
                    return (
                      <div key={status}>
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                          <span className="text-xs font-semibold text-muted-foreground">{cfg.label}</span>
                        </div>
                        {colTasks.map(task => (
                          <div key={task.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                            <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                            <span className="flex-1 text-sm">{task.title}</span>
                            {task.assignee_email && (
                              <span className="text-xs text-muted-foreground">{task.assignee_email.split('@')[0]}</span>
                            )}
                            {task.due_date && (
                              <span className="text-xs text-muted-foreground">{format(new Date(task.due_date), 'MMM d')}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {tasks.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No tasks yet. Switch to Board view to add some.</p>
                  )}
                </div>
              )}

              {/* Workload chart */}
              {members.length > 0 && tasks.length > 0 && (
                <WorkloadChart tasks={tasks} members={members} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Projects page ────────────────────────────────────────────────────────


// ── Zod validation schema ─────────────────────────────────────────────────────
const ProjectFormSchema = z.object({
  name:        z.string().min(2, 'Project name must be at least 2 characters').max(150, 'Too long').trim(),
  description: z.string().max(2000, 'Too long').optional().or(z.literal('')),
  status:      z.enum(['active', 'completed', 'on_hold', 'cancelled']),
  start_date:  z.string().optional().or(z.literal('')),
  end_date:    z.string().optional().or(z.literal('')),
  budget:      z.string().refine(v => !v || !isNaN(parseFloat(v)), 'Budget must be a number').optional().or(z.literal('')),
}).refine(d => !d.end_date || !d.start_date || d.end_date >= d.start_date, {
  message: 'End date must be after start date',
  path: ['end_date'],
});
type ProjectFormErrors = Partial<Record<string, string>>;

export default function Projects() {
  const { user, role, profile } = useAuth();
  const { toast }   = useToast();
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();
  const canManageProjects = role === 'admin' || role === 'manager';

  const [projects,       setProjects]       = useState<Project[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [isDialogOpen,   setIsDialogOpen]   = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [drawerProject,  setDrawerProject]  = useState<Project | null>(null);
  const [formData,       setFormData]       = useState({
    name: '', description: '', status: 'active' as Project['status'],
    start_date: '', end_date: '', budget: '',
  });
  const [formErrors, setFormErrors] = useState<ProjectFormErrors>({});

  const fetchProjects = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); }
    else { setProjects((data as Project[]) || []); }
    setLoading(false);
  };

  useEffect(() => { fetchProjects(); }, [user]);

  const rateProject = async (project: Project, value: number) => {
    if (role !== 'user') return;
    const { error } = await supabase.from('projects').update({ rating: value } as any).eq('id', project.id);
    if (error) { toast({ variant: 'destructive', title: 'Rating failed', description: error.message }); return; }
    toast({ title: `Rated ${value} star${value > 1 ? 's' : ''}` });
    fetchProjects();
  };

  const resetForm = () => {
    setFormErrors({});
    setFormData({ name: '', description: '', status: 'active', start_date: '', end_date: '', budget: '' });
    setEditingProject(null);
  };

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    const rows = projects.map(p => ({
      Name: p.name, Status: p.status,
      StartDate: p.start_date ?? '—', EndDate: p.end_date ?? '—', Budget: p.budget ?? '—',
    }));
    if (type === 'csv')   exportToCSV('projects', rows);
    if (type === 'excel') exportToExcel('projects', rows);
    if (type === 'pdf')   exportToPDF('projects', rows, {
      title: 'ZIT Solutions – CRM', subtitle: 'Projects Report',
      exportedBy: profile?.email ?? user?.email ?? 'System',
    });
    logAudit({ userId: user?.id, userEmail: profile?.email ?? user?.email, action: 'EXPORT', entity: 'projects', entityId: `${type.toUpperCase()} (${rows.length} rows)` });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name:        formData.name,
      description: formData.description || null,
      status:      formData.status,
      start_date:  formData.start_date  || null,
      end_date:    formData.end_date    || null,
      budget:      parseFloat(formData.budget) || null,
    };
    if (editingProject) {
      const { error } = await supabase.from('projects').update(payload).eq('id', editingProject.id);
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Project updated' });
    } else {
      const { error } = await supabase.from('projects').insert({ ...payload, created_by: user?.id });
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Project created' });
    }
    setIsDialogOpen(false); resetForm(); fetchProjects();
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name:        project.name,
      description: project.description || '',
      status:      project.status,
      start_date:  project.start_date  || '',
      end_date:    project.end_date    || '',
      budget:      project.budget?.toString() || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (project: Project) => {
    confirm({
      title: `Delete "${project.name}"?`,
      description: 'This will also delete all tasks for this project.',
      onConfirm: async () => {
        // Delete tasks first
        await (supabase as any).from('project_tasks').delete().eq('project_id', project.id);
        const { error } = await supabase.from('projects').delete().eq('id', project.id);
        if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
        toast({ title: 'Project deleted' }); fetchProjects();
      },
    });
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);

  const getStatusPill = (status: string) => {
    const cfg = STATUS_CFG[status] || STATUS_CFG.on_hold;
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.pill}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
      </span>
    );
  };

  const columns = [
    {
      key: 'name', header: 'Name',
      render: (p: Project) => (
        <div className="flex items-center gap-2.5">
          <ProjectAvatar name={p.name} />
          <span className="font-semibold text-slate-800">{p.name}</span>
        </div>
      ),
    },
    { key: 'status',     header: 'Status',     render: (p: Project) => getStatusPill(p.status) },
    { key: 'start_date', header: 'Start Date',  render: (p: Project) => p.start_date ? <span className="text-slate-600 text-sm">{format(new Date(p.start_date), 'MMM d, yyyy')}</span> : '—' },
    { key: 'end_date',   header: 'End Date',    render: (p: Project) => p.end_date   ? <span className="text-slate-600 text-sm">{format(new Date(p.end_date), 'MMM d, yyyy')}</span>   : '—' },
    {
      key: 'budget', header: 'Budget',
      render: (p: Project) => p.budget
        ? <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-2.5 py-0.5 text-xs font-semibold">{formatCurrency(p.budget)}</span>
        : '—',
    },
    {
      key: 'actions', header: 'Actions',
      render: (project: Project) => (
        <div className="flex items-center gap-1">
          {/* Tasks button — opens drawer */}
          <Button
            size="sm" variant="ghost"
            className="hover:bg-indigo-50 hover:text-indigo-600 transition-colors gap-1.5"
            onClick={() => setDrawerProject(project)}
          >
            <ListTodo className="h-3.5 w-3.5" />
            Tasks
            <ChevronRight className="h-3 w-3" />
          </Button>
          {canManageProjects && (
            <>
              <button onClick={() => handleEdit(project)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => handleDelete(project)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {role === 'user' && (
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map(star => (
                <button key={star} onClick={() => rateProject(project, star)}
                  className={`text-lg transition-transform hover:scale-125 ${project.rating && project.rating >= star ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'}`}>
                  ★
                </button>
              ))}
            </div>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Task drawer */}
      {drawerProject && (
        <TaskDrawer project={drawerProject} onClose={() => setDrawerProject(null)} />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage client projects and track tasks</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageProjects && <ExportDropdown onExport={handleExport} />}
          <Dialog open={isDialogOpen} onOpenChange={open => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            {canManageProjects && (
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Add Project</Button>
              </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingProject ? 'Edit Project' : 'Add New Project'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label>Project Name <span className="text-destructive">*</span></Label>
                  <Input value={formData.name} className={formErrors.name ? 'border-destructive' : ''} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v as Project['status'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input type="date" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Budget ($)</Label>
                  <Input type="number" value={formData.budget} onChange={e => setFormData({ ...formData, budget: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
                  <Button type="submit">{editingProject ? 'Update Project' : 'Create Project'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-4 md:hidden">
        {projects.map(project => (
          <MobileCard
            key={project.id}
            title={<span className="flex items-center gap-2"><ProjectAvatar name={project.name} />{project.name}</span>}
            badge={getStatusPill(project.status)}
            details={[
              { label: 'Start',  value: project.start_date ? format(new Date(project.start_date), 'MMM d, yyyy') : '—' },
              { label: 'End',    value: project.end_date   ? format(new Date(project.end_date),   'MMM d, yyyy') : '—' },
              { label: 'Budget', value: project.budget ? formatCurrency(project.budget) : '—' },
            ]}
            actions={
              <>
                <Button size="sm" variant="outline" onClick={() => setDrawerProject(project)}>
                  <ListTodo className="h-4 w-4 mr-1" />Tasks
                </Button>
                {canManageProjects && (
                  <>
                    <button onClick={() => handleEdit(project)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(project)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
                {role === 'user' && (
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(star => (
                      <button key={star} onClick={() => rateProject(project, star)}
                        className={`text-xl transition-transform hover:scale-125 ${project.rating && project.rating >= star ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'}`}>
                        ★
                      </button>
                    ))}
                  </div>
                )}
              </>
            }
          />
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={projects}
          emptyIcon={FolderKanban}
          emptyTitle="No projects yet"
          emptyDescription={canManageProjects ? 'Create a project to start tracking tasks.' : 'No projects available.'}
          emptyActionLabel={canManageProjects ? 'Add first project' : undefined}
          onEmptyAction={canManageProjects ? () => setIsDialogOpen(true) : undefined}
        />
      </div>

      <ConfirmDeleteDialog />
    </div>
  );
}