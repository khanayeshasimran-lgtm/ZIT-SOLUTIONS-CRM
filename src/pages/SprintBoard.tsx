/**
 * pages/SprintBoard.tsx
 *
 * Sprint & Backlog board for Z IT Solutions CRM.
 * - Project selector → Sprint selector → Kanban columns
 * - Columns: Backlog | To Do | In Progress | Review | Done
 * - Drag-and-drop tasks between columns
 * - Create/start/complete sprints
 * - Create tasks, assign story points + priority
 * - Velocity bar (story points done vs total)
 * - All roles can view; admin/manager can manage sprints; users manage own tasks
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirmDelete } from '@/hooks/useConfirmDelete';
import { PageLoader } from '@/components/PageLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Zap, CheckCircle2, Circle, Clock, RotateCcw,
  Pencil, Trash2, ChevronDown, ChevronRight,
  Kanban, ArrowRight, Target,
} from 'lucide-react';
import { format } from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  status: string;
}

interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  status: 'planning' | 'active' | 'completed';
  start_date: string | null;
  end_date: string | null;
  project_id: string;
}

type TaskStatus   = 'todo' | 'in_progress' | 'review' | 'done';
type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

interface SprintTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  story_points: number;
  sprint_id: string | null;
  project_id: string;
  assignee_id: string | null;
  assignee_email?: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const COLUMNS: { key: TaskStatus | 'backlog'; label: string; accent: string; light: string; icon: React.ElementType }[] = [
  { key: 'backlog',     label: 'Backlog',     accent: '#94a3b8', light: '#f8fafc', icon: RotateCcw   },
  { key: 'todo',        label: 'To Do',       accent: '#6366f1', light: '#eef2ff', icon: Circle       },
  { key: 'in_progress', label: 'In Progress', accent: '#f59e0b', light: '#fffbeb', icon: Clock        },
  { key: 'review',      label: 'Review',      accent: '#8b5cf6', light: '#f5f3ff', icon: ArrowRight   },
  { key: 'done',        label: 'Done',        accent: '#10b981', light: '#ecfdf5', icon: CheckCircle2 },
];

const PRIORITY_CFG: Record<TaskPriority, { label: string; color: string; bg: string; icon: string }> = {
  low:      { label: 'Low',      color: 'text-slate-500',   bg: 'bg-slate-100',   icon: '▽' },
  medium:   { label: 'Medium',   color: 'text-amber-600',   bg: 'bg-amber-50',    icon: '◈' },
  high:     { label: 'High',     color: 'text-orange-600',  bg: 'bg-orange-50',   icon: '▲' },
  critical: { label: 'Critical', color: 'text-red-600',     bg: 'bg-red-50',      icon: '🔥' },
};

const SPRINT_STATUS_CFG = {
  planning:  { label: 'Planning',  pill: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',     dot: 'bg-slate-400'   },
  active:    { label: 'Active',    pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-400' },
  completed: { label: 'Completed', pill: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',             dot: 'bg-sky-400'     },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function Avatar({ email, size = 6 }: { email: string; size?: number }) {
  const colors = [
    'from-indigo-400 to-indigo-600',
    'from-sky-400 to-sky-600',
    'from-violet-400 to-violet-600',
    'from-emerald-400 to-emerald-600',
    'from-amber-400 to-amber-600',
  ];
  const color = colors[email.charCodeAt(0) % colors.length];
  return (
    <div className={`h-${size} w-${size} rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
      {email[0].toUpperCase()}
    </div>
  );
}

function VelocityBar({ tasks }: { tasks: SprintTask[] }) {
  const total = tasks.reduce((s, t) => s + (t.story_points || 0), 0);
  const done  = tasks.filter(t => t.status === 'done').reduce((s, t) => s + (t.story_points || 0), 0);
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-slate-500 tabular-nums shrink-0">
        {done}/{total} pts · {pct}%
      </span>
    </div>
  );
}

// ── Task Card ──────────────────────────────────────────────────────────────────

function TaskCard({
  task, onEdit, onDelete, canAct, isDragging,
  onDragStart, onDragEnd,
}: {
  task: SprintTask;
  onEdit: (t: SprintTask) => void;
  onDelete: (t: SprintTask) => void;
  canAct: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
}) {
  const p = PRIORITY_CFG[task.priority];
  return (
    <div
      draggable={canAct}
      onDragStart={e => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      className={`group relative bg-white rounded-xl border shadow-[0_1px_4px_rgba(0,0,0,0.04)]
        hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-all duration-150 p-3
        ${canAct ? 'cursor-grab active:cursor-grabbing' : ''}
        ${isDragging ? 'opacity-40 border-dashed border-slate-300' : 'border-slate-200/80 hover:border-indigo-200/80'}`}
    >
      {/* Priority stripe */}
      <div className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full ${
        task.priority === 'critical' ? 'bg-red-500' :
        task.priority === 'high'     ? 'bg-orange-400' :
        task.priority === 'medium'   ? 'bg-amber-400' : 'bg-slate-200'
      }`} />

      <div className="pl-2">
        <p className="text-[13px] font-semibold text-slate-800 leading-tight mb-1.5">
          {task.title}
        </p>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Priority */}
          <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${p.bg} ${p.color}`}>
            <span>{p.icon}</span>{p.label}
          </span>
          {/* Story points */}
          {task.story_points > 0 && (
            <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-600">
              {task.story_points}pt
            </span>
          )}
          {/* Due date */}
          {task.due_date && (
            <span className="text-[10px] text-slate-400">
              {format(new Date(task.due_date), 'MMM d')}
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-2">
          {task.assignee_email ? (
            <Avatar email={task.assignee_email} size={5} />
          ) : (
            <div className="h-5 w-5 rounded-full border-2 border-dashed border-slate-200" />
          )}
          {canAct && (
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(task)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => onDelete(task)}
                className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SprintBoard() {
  const { user, role, profile } = useAuth();
  const { toast } = useToast();
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();

  const canManage = role === 'admin' || role === 'manager';

  // ── State ──────────────────────────────────────────────────────────────────
  const [projects,        setProjects]        = useState<Project[]>([]);
  const [sprints,         setSprints]         = useState<Sprint[]>([]);
  const [tasks,           setTasks]           = useState<SprintTask[]>([]);
  const [members,         setMembers]         = useState<{ id: string; email: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedSprint,  setSelectedSprint]  = useState<string>('backlog');
  const [loading,         setLoading]         = useState(true);
  const [backlogOpen,     setBacklogOpen]      = useState(true);

  // Dialogs
  const [sprintDialog,  setSprintDialog]  = useState(false);
  const [taskDialog,    setTaskDialog]    = useState(false);
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  const [editingTask,   setEditingTask]   = useState<SprintTask | null>(null);
  const [taskColumn,    setTaskColumn]    = useState<TaskStatus | 'backlog'>('backlog');

  const [sprintForm, setSprintForm] = useState({ name: '', goal: '', start_date: '', end_date: '' });
  const [taskForm,   setTaskForm]   = useState({
    title: '', description: '', priority: 'medium' as TaskPriority,
    story_points: '0', assignee_id: '', due_date: '',
  });

  // Drag
  const dragId = useRef<string | null>(null);
  const [dragOver,   setDragOver]   = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  const fetchProjects = async () => {
    const { data } = await (supabase as any)
      .from('projects')
      .select('id, name, status')
      .order('name');
    setProjects((data ?? []) as Project[]);
    if (data?.length && !selectedProject) {
      setSelectedProject(data[0].id);
    }
  };

  const fetchSprints = async (projectId: string) => {
    const { data } = await (supabase as any)
      .from('sprints')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setSprints((data ?? []) as Sprint[]);
    const active = (data ?? []).find((s: Sprint) => s.status === 'active');
    if (active) setSelectedSprint(active.id);
  };

  const fetchTasks = async (projectId: string) => {
    const { data } = await (supabase as any)
      .from('project_tasks')
      .select('*, profiles!assignee_id(email)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    setTasks(
      ((data ?? []) as any[]).map((t: any) => ({
        ...t,
        assignee_email: t.profiles?.email ?? null,
        priority:       t.priority      ?? 'medium',
        story_points:   t.story_points  ?? 0,
      })) as SprintTask[]
    );
  };

  const fetchMembers = async () => {
    const { data } = await (supabase as any)
      .from('profiles')
      .select('id, email')
      .order('email');
    setMembers((data ?? []) as { id: string; email: string }[]);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchProjects(), fetchMembers()]);
      setLoading(false);
    };
    if (user) init();
  }, [user]);

  useEffect(() => {
    if (!selectedProject) return;
    fetchSprints(selectedProject);
    fetchTasks(selectedProject);
  }, [selectedProject]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const activeSprint = sprints.find(s => s.id === selectedSprint);

  const sprintTasks = selectedSprint === 'backlog'
    ? []
    : tasks.filter(t => t.sprint_id === selectedSprint);

  const backlogTasks = tasks.filter(t => !t.sprint_id);

  const columnTasks = (col: TaskStatus | 'backlog') => {
    if (col === 'backlog') return backlogTasks;
    return sprintTasks.filter(t => t.status === col);
  };

  const canActOnTask = (task: SprintTask) =>
    canManage || task.created_by === user?.id;

  // ── Drag & drop ─────────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragId.current = id;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    dragId.current = null;
    setDraggingId(null);
    setDragOver(null);
  };

  const handleDrop = async (e: React.DragEvent, col: TaskStatus | 'backlog') => {
    e.preventDefault();
    setDragOver(null);
    const id = dragId.current;
    if (!id) return;

    const task = tasks.find(t => t.id === id);
    if (!task || !canActOnTask(task)) return;

    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (col === 'backlog') return { ...t, sprint_id: null, status: 'todo' };
      return { ...t, sprint_id: selectedSprint === 'backlog' ? t.sprint_id : selectedSprint, status: col as TaskStatus };
    }));

    const payload: any = col === 'backlog'
      ? { sprint_id: null, status: 'todo' }
      : { status: col, sprint_id: selectedSprint === 'backlog' ? task.sprint_id : selectedSprint };

    const { error } = await (supabase as any)
      .from('project_tasks')
      .update(payload)
      .eq('id', id);

    if (error) {
      toast({ variant: 'destructive', title: 'Failed to move task', description: error.message });
      fetchTasks(selectedProject);
    }
  };

  // ── Sprint CRUD ──────────────────────────────────────────────────────────────

  const resetSprintForm = () => {
    setSprintForm({ name: '', goal: '', start_date: '', end_date: '' });
    setEditingSprint(null);
  };

  const handleSprintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    const orgId = (profile as any)?.organization_id;
    const payload = {
      name:            sprintForm.name,
      goal:            sprintForm.goal || null,
      start_date:      sprintForm.start_date || null,
      end_date:        sprintForm.end_date   || null,
      project_id:      selectedProject,
      organization_id: orgId,
    };

    if (editingSprint) {
      const { error } = await (supabase as any).from('sprints').update(payload).eq('id', editingSprint.id);
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Sprint updated' });
    } else {
      const { error } = await (supabase as any).from('sprints').insert([{ ...payload, status: 'planning', created_by: user?.id }]);
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Sprint created 🚀' });
    }

    setSprintDialog(false);
    resetSprintForm();
    fetchSprints(selectedProject);
  };

  const handleSprintStatus = async (sprint: Sprint, status: Sprint['status']) => {
    const { error } = await (supabase as any).from('sprints').update({ status }).eq('id', sprint.id);
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
    toast({ title: status === 'active' ? 'Sprint started! 🏃' : 'Sprint completed ✅' });
    fetchSprints(selectedProject);
  };

  const handleDeleteSprint = (sprint: Sprint) => {
    confirm({
      title: `Delete "${sprint.name}"?`,
      description: 'Tasks will remain but will be unlinked from this sprint.',
      onConfirm: async () => {
        await (supabase as any).from('project_tasks').update({ sprint_id: null }).eq('sprint_id', sprint.id);
        await (supabase as any).from('sprints').delete().eq('id', sprint.id);
        toast({ title: 'Sprint deleted' });
        setSelectedSprint('backlog');
        fetchSprints(selectedProject);
        fetchTasks(selectedProject);
      },
    });
  };

  // ── Task CRUD ────────────────────────────────────────────────────────────────

  const resetTaskForm = () => {
    setTaskForm({ title: '', description: '', priority: 'medium', story_points: '0', assignee_id: '', due_date: '' });
    setEditingTask(null);
  };

  const openTaskDialog = (col: TaskStatus | 'backlog', task?: SprintTask) => {
    setTaskColumn(col);
    if (task) {
      setEditingTask(task);
      setTaskForm({
        title:        task.title,
        description:  task.description ?? '',
        priority:     task.priority,
        story_points: String(task.story_points),
        assignee_id:  task.assignee_id ?? '',
        due_date:     task.due_date    ?? '',
      });
    } else {
      resetTaskForm();
    }
    setTaskDialog(true);
  };

  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const orgId = (profile as any)?.organization_id;

    const payload: any = {
      title:        taskForm.title,
      description:  taskForm.description || null,
      priority:     taskForm.priority,
      story_points: Number(taskForm.story_points) || 0,
      assignee_id:  taskForm.assignee_id || null,
      due_date:     taskForm.due_date    || null,
      status:       taskColumn === 'backlog' ? 'todo' : taskColumn,
      sprint_id:    taskColumn === 'backlog' || selectedSprint === 'backlog' ? null : selectedSprint,
    };

    if (editingTask) {
      const { error } = await (supabase as any).from('project_tasks').update(payload).eq('id', editingTask.id);
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Task updated' });
    } else {
      const { error } = await (supabase as any).from('project_tasks').insert([{
        ...payload,
        project_id:      selectedProject,
        organization_id: orgId,
        created_by:      user?.id,
        parent_task_id:  null,
      }]);
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Task created' });
    }

    setTaskDialog(false);
    resetTaskForm();
    fetchTasks(selectedProject);
  };

  const handleDeleteTask = (task: SprintTask) => {
    confirm({
      title: `Delete "${task.title}"?`,
      description: 'This cannot be undone.',
      onConfirm: async () => {
        await (supabase as any).from('project_tasks').delete().eq('id', task.id);
        toast({ title: 'Task deleted' });
        fetchTasks(selectedProject);
      },
    });
  };

  // ── Move backlog task to sprint ──────────────────────────────────────────────

  const moveToSprint = async (taskId: string, sprintId: string) => {
    const { error } = await (supabase as any)
      .from('project_tasks')
      .update({ sprint_id: sprintId, status: 'todo' })
      .eq('id', taskId);
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
    fetchTasks(selectedProject);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <PageLoader />;

  const visibleColumns = selectedSprint === 'backlog'
    ? COLUMNS.filter(c => c.key === 'backlog')
    : COLUMNS;

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Kanban className="h-6 w-6 text-indigo-600" />
            Sprint Board
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Plan sprints, track tasks, ship faster
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {projects.length > 1 && (
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="h-9 w-48 text-sm">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canManage && (
            <Button size="sm" onClick={() => { resetSprintForm(); setSprintDialog(true); }}>
              <Plus className="h-4 w-4 mr-1.5" />New Sprint
            </Button>
          )}
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-16 text-center">
          <Kanban className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-500">No projects found</p>
          <p className="text-sm text-slate-400 mt-1">Create a project first to start sprint planning.</p>
        </div>
      ) : (
        <>
          {/* ── Sprint selector tabs ── */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedSprint('backlog')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ring-1
                ${selectedSprint === 'backlog'
                  ? 'bg-slate-800 text-white ring-slate-800 shadow-md'
                  : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Backlog
              {backlogTasks.length > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] font-bold ${selectedSprint === 'backlog' ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                  {backlogTasks.length}
                </span>
              )}
            </button>

            {sprints.map(s => {
              const cfg    = SPRINT_STATUS_CFG[s.status];
              const active = selectedSprint === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSprint(s.id)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ring-1
                    ${active
                      ? 'bg-indigo-600 text-white ring-indigo-600 shadow-md'
                      : 'bg-white text-slate-600 ring-slate-200 hover:ring-indigo-200'}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : cfg.dot}`} />
                  {s.name}
                  {s.status === 'active' && (
                    <span className={`rounded-full px-1.5 text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-600'}`}>
                      ACTIVE
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Active sprint header ── */}
          {activeSprint && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-slate-800">{activeSprint.name}</h2>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${SPRINT_STATUS_CFG[activeSprint.status].pill}`}>
                      {SPRINT_STATUS_CFG[activeSprint.status].label}
                    </span>
                    {activeSprint.start_date && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(activeSprint.start_date), 'MMM d')}
                        {activeSprint.end_date && ` → ${format(new Date(activeSprint.end_date), 'MMM d, yyyy')}`}
                      </span>
                    )}
                  </div>
                  {activeSprint.goal && (
                    <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                      {activeSprint.goal}
                    </p>
                  )}
                  <div className="mt-2 max-w-sm">
                    <VelocityBar tasks={sprintTasks} />
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingSprint(activeSprint);
                        setSprintForm({
                          name:       activeSprint.name,
                          goal:       activeSprint.goal ?? '',
                          start_date: activeSprint.start_date ?? '',
                          end_date:   activeSprint.end_date   ?? '',
                        });
                        setSprintDialog(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                    </Button>
                    {activeSprint.status === 'planning' && (
                      <Button size="sm" onClick={() => handleSprintStatus(activeSprint, 'active')}>
                        <Zap className="h-3.5 w-3.5 mr-1" />Start Sprint
                      </Button>
                    )}
                    {activeSprint.status === 'active' && (
                      <Button size="sm" variant="outline" onClick={() => handleSprintStatus(activeSprint, 'completed')}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Complete
                      </Button>
                    )}
                    <button
                      onClick={() => handleDeleteSprint(activeSprint)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Backlog header (when in backlog view) ── */}
          {selectedSprint === 'backlog' && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setBacklogOpen(v => !v)}
                className="flex items-center gap-2 font-semibold text-slate-700 hover:text-slate-900 transition-colors"
              >
                {backlogOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Backlog
                <span className="text-xs font-normal text-muted-foreground">
                  ({backlogTasks.length} tasks)
                </span>
              </button>
              <Button size="sm" variant="outline" onClick={() => openTaskDialog('backlog')}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add to Backlog
              </Button>
            </div>
          )}

          {/* ── Kanban columns ── */}
          <div
            className="grid gap-4 overflow-x-auto pb-2"
            style={{ gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(240px, 1fr))` }}
          >
            {visibleColumns.map(col => {
              const colTasks = columnTasks(col.key);
              const isOver   = dragOver === col.key;
              const Icon     = col.icon;

              return (
                <div
                  key={col.key}
                  className="flex flex-col rounded-2xl overflow-hidden border border-slate-200/70 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all"
                  style={{
                    borderTop:  `3px solid ${col.accent}`,
                    boxShadow:  isOver ? `0 0 0 2px ${col.accent}40, 0 8px 32px rgba(0,0,0,0.08)` : undefined,
                    background: isOver ? col.light : undefined,
                  }}
                  onDragOver={e => { e.preventDefault(); setDragOver(col.key); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => handleDrop(e, col.key)}
                >
                  {/* Column header */}
                  <div className="px-4 pt-3.5 pb-3 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" style={{ color: col.accent }} />
                        <span className="text-[13px] font-bold text-slate-800">{col.label}</span>
                        {colTasks.length > 0 && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={{ backgroundColor: col.light, color: col.accent }}
                          >
                            {colTasks.length}
                          </span>
                        )}
                      </div>
                      {(col.key !== 'backlog' || selectedSprint === 'backlog') && (
                        <button
                          onClick={() => openTaskDialog(col.key)}
                          className="rounded-lg p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {colTasks.some(t => t.story_points > 0) && (
                      <p className="text-[11px] font-semibold mt-1" style={{ color: col.accent }}>
                        {colTasks.reduce((s, t) => s + t.story_points, 0)} pts
                      </p>
                    )}
                  </div>

                  {/* Tasks */}
                  <div className="overflow-y-auto p-2.5 space-y-2 min-h-[200px] max-h-[60vh]">
                    {isOver && (
                      <div
                        className="rounded-xl border-2 border-dashed flex items-center justify-center py-3 text-[11px] font-bold"
                        style={{ borderColor: col.accent, color: col.accent, background: col.light }}
                      >
                        Drop here
                      </div>
                    )}

                    {colTasks.length === 0 && !isOver && (
                      <div className="flex flex-col items-center justify-center py-8 gap-2">
                        <div className="h-8 w-8 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center">
                          <Plus className="h-3.5 w-3.5 text-slate-300" />
                        </div>
                        <p className="text-[11px] text-slate-300 font-medium">No tasks</p>
                      </div>
                    )}

                    {colTasks.map(task => (
                      <div key={task.id}>
                        <TaskCard
                          task={task}
                          onEdit={t => openTaskDialog(col.key, t)}
                          onDelete={handleDeleteTask}
                          canAct={canActOnTask(task)}
                          isDragging={draggingId === task.id}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                        />
                        {col.key === 'backlog' && selectedSprint === 'backlog' && sprints.filter(s => s.status !== 'completed').length > 0 && canActOnTask(task) && (
                          <div className="mt-1 flex gap-1 flex-wrap">
                            {sprints.filter(s => s.status !== 'completed').map(s => (
                              <button
                                key={s.id}
                                onClick={() => moveToSprint(task.id, s.id)}
                                className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                              >
                                → {s.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Sprint Dialog ── */}
      <Dialog open={sprintDialog} onOpenChange={o => { setSprintDialog(o); if (!o) resetSprintForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSprint ? 'Edit Sprint' : 'New Sprint'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSprintSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Sprint Name *</Label>
              <Input
                required
                placeholder="e.g. Sprint 1 — Auth & Dashboard"
                value={sprintForm.name}
                onChange={e => setSprintForm({ ...sprintForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Sprint Goal</Label>
              <Input
                placeholder="What does this sprint aim to achieve?"
                value={sprintForm.goal}
                onChange={e => setSprintForm({ ...sprintForm, goal: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={sprintForm.start_date} onChange={e => setSprintForm({ ...sprintForm, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={sprintForm.end_date} onChange={e => setSprintForm({ ...sprintForm, end_date: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setSprintDialog(false); resetSprintForm(); }}>Cancel</Button>
              <Button type="submit">{editingSprint ? 'Save Changes' : 'Create Sprint'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Task Dialog ── */}
      <Dialog open={taskDialog} onOpenChange={o => { setTaskDialog(o); if (!o) resetTaskForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Edit Task' : `Add Task — ${COLUMNS.find(c => c.key === taskColumn)?.label}`}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTaskSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                required
                placeholder="e.g. Implement login flow"
                value={taskForm.title}
                onChange={e => setTaskForm({ ...taskForm, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Optional details…"
                value={taskForm.description}
                onChange={e => setTaskForm({ ...taskForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={taskForm.priority} onValueChange={v => setTaskForm({ ...taskForm, priority: v as TaskPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(PRIORITY_CFG) as [TaskPriority, typeof PRIORITY_CFG[TaskPriority]][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Story Points</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="0"
                  value={taskForm.story_points}
                  onChange={e => setTaskForm({ ...taskForm, story_points: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Assignee</Label>
                {/* FIX: SelectItem cannot have empty string value — use "none" sentinel */}
                <Select
                  value={taskForm.assignee_id || 'none'}
                  onValueChange={v => setTaskForm({ ...taskForm, assignee_id: v === 'none' ? '' : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {members.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={taskForm.due_date} onChange={e => setTaskForm({ ...taskForm, due_date: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setTaskDialog(false); resetTaskForm(); }}>Cancel</Button>
              <Button type="submit">{editingTask ? 'Save Changes' : 'Add Task'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog />
    </div>
  );
}