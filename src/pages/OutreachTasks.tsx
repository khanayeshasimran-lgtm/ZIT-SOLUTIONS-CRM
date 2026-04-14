import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirmDelete } from '@/hooks/useConfirmDelete';
import { PageLoader } from '@/components/PageLoader';
import { MobileCard } from '@/components/MobileCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable } from '@/components/ui/DataTable';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ListTodo, Plus, Trash2, Pencil, Phone, Mail, Calendar, Users, Building2, UserPlus, Bell,
} from 'lucide-react';
import { format } from 'date-fns';

type TaskType = 'to_do' | 'call' | 'email' | 'meeting' | 'follow_up' | 'demo';
type TaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';
type TaskStatus = 'scheduled' | 'completed' | 'cancelled';
type Reminder = 'none' | '15min' | '1hour' | '1day' | '2days';

interface LinkedRecord { id: string; label: string; }

interface OutreachTask {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  due_date: string | null;
  status: TaskStatus;
  task_type: TaskType;
  priority: TaskPriority;
  reminder: Reminder;
  lead_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  lead_name?: string | null;
  contact_name?: string | null;
  company_name?: string | null;
}

const STATUS_CFG: Record<TaskStatus, { label: string; pill: string; dot: string }> = {
  scheduled: { label: 'Scheduled', pill: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200', dot: 'bg-indigo-400' },
  completed: { label: 'Completed', pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-400' },
  cancelled: { label: 'Cancelled', pill: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200', dot: 'bg-slate-400' },
};

const PRIORITY_CFG: Record<TaskPriority, { label: string; pill: string; dot: string }> = {
  none:   { label: 'None',   pill: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',   dot: 'bg-slate-300' },
  low:    { label: 'Low',    pill: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',   dot: 'bg-slate-400' },
  medium: { label: 'Medium', pill: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',          dot: 'bg-sky-400' },
  high:   { label: 'High',   pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',    dot: 'bg-amber-400' },
  urgent: { label: 'Urgent', pill: 'bg-red-50 text-red-700 ring-1 ring-red-200',          dot: 'bg-red-400' },
};

const TYPE_CFG: Record<TaskType, { label: string; icon: React.ElementType; color: string }> = {
  to_do:    { label: 'To-do',     icon: ListTodo, color: 'text-slate-500' },
  call:     { label: 'Call',      icon: Phone,    color: 'text-sky-500' },
  email:    { label: 'Email',     icon: Mail,     color: 'text-indigo-500' },
  meeting:  { label: 'Meeting',   icon: Calendar, color: 'text-violet-500' },
  follow_up:{ label: 'Follow-up', icon: Bell,     color: 'text-amber-500' },
  demo:     { label: 'Demo',      icon: Users,    color: 'text-emerald-500' },
};

export default function OutreachTasks() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();

  const canManage = role === 'admin' || role === 'manager';
  const canAdd = role === 'admin' || role === 'manager' || role === 'user';

  const [tasks, setTasks] = useState<OutreachTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<OutreachTask | null>(null);
  const [leads, setLeads] = useState<LinkedRecord[]>([]);
  const [contacts, setContacts] = useState<LinkedRecord[]>([]);
  const [companies, setCompanies] = useState<LinkedRecord[]>([]);

  const emptyForm = { title: '', description: '', notes: '', due_date: '', status: 'scheduled' as TaskStatus, task_type: 'to_do' as TaskType, priority: 'none' as TaskPriority, reminder: 'none' as Reminder, lead_id: '', contact_id: '', company_id: '' };
  const [form, setForm] = useState(emptyForm);

  const fetchLinkedOptions = async () => {
    const [{ data: leadsData }, { data: contactsData }, { data: companiesData }] = await Promise.all([
      supabase.from('leads').select('id, name').order('name'),
      supabase.from('contacts').select('id, first_name, last_name').order('first_name'),
      supabase.from('companies').select('id, name').order('name'),
    ]);
    const mappedLeads = (leadsData ?? []).map((l: any) => ({ id: l.id, label: l.name }));
    const mappedContacts = (contactsData ?? []).map((c: any) => ({ id: c.id, label: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() }));
    const mappedCompanies = (companiesData ?? []).map((c: any) => ({ id: c.id, label: c.name }));
    setLeads(mappedLeads); setContacts(mappedContacts); setCompanies(mappedCompanies);
    return { mappedLeads, mappedContacts, mappedCompanies };
  };

  const fetchTasks = async (lMap: LinkedRecord[] = [], cMap: LinkedRecord[] = [], coMap: LinkedRecord[] = []) => {
    if (!user) return;
    const { data, error } = await (supabase as any).from('outreach_tasks').select('id, title, description, notes, due_date, status, task_type, priority, reminder, lead_id, contact_id, company_id').order('due_date', { ascending: true });
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); }
    else { setTasks((data ?? []).map((t: any) => ({ ...t, lead_name: lMap.find(l => l.id === t.lead_id)?.label ?? null, contact_name: cMap.find(c => c.id === t.contact_id)?.label ?? null, company_name: coMap.find(c => c.id === t.company_id)?.label ?? null }))); }
    setLoading(false);
  };

  useEffect(() => { fetchLinkedOptions().then(({ mappedLeads, mappedContacts, mappedCompanies }) => { fetchTasks(mappedLeads, mappedContacts, mappedCompanies); }); }, [user]);

  const resetForm = () => { setForm(emptyForm); setEditingTask(null); };

  const handleEdit = (task: OutreachTask) => {
    setEditingTask(task);
    setForm({ title: task.title, description: task.description || '', notes: task.notes || '', due_date: task.due_date ? task.due_date.slice(0, 16) : '', status: task.status, task_type: task.task_type || 'to_do', priority: task.priority || 'none', reminder: task.reminder || 'none', lead_id: task.lead_id || '', contact_id: task.contact_id || '', company_id: task.company_id || '' });
    setDialogOpen(true);
  };

  const handleDelete = (task: OutreachTask) => {
    confirm({
      title: `Delete "${task.title}"?`, description: 'This action cannot be undone.',
      onConfirm: async () => {
        const { error } = await supabase.from('outreach_tasks').delete().eq('id', task.id);
        if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
        toast({ title: 'Task deleted' }); fetchTasks();
      },
    });
  };

  const toggleComplete = async (task: OutreachTask) => {
    const newStatus: TaskStatus = task.status === 'completed' ? 'scheduled' : 'completed';
    const { error } = await supabase.from('outreach_tasks').update({ status: newStatus }).eq('id', task.id);
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
    toast({ title: newStatus === 'completed' ? 'Marked complete ✓' : 'Marked incomplete' });
    fetchTasks();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdd) { toast({ variant: 'destructive', title: 'Permission denied' }); return; }
    const payload = { title: form.title, description: form.description || null, notes: form.notes || null, due_date: form.due_date || null, status: form.status, task_type: form.task_type, priority: form.priority, reminder: form.reminder, lead_id: form.lead_id || null, contact_id: form.contact_id || null, company_id: form.company_id || null };
    if (editingTask) {
      const { error } = await supabase.from('outreach_tasks').update(payload).eq('id', editingTask.id);
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Task updated' });
    } else {
      const { error } = await supabase.from('outreach_tasks').insert({ ...payload, created_by: user?.id });
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Task created' });
    }
    setDialogOpen(false); resetForm(); fetchTasks();
  };

  const getStatusPill = (status: TaskStatus) => {
    const cfg = STATUS_CFG[status];
    return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span>;
  };

  const getPriorityPill = (priority: TaskPriority) => {
    if (priority === 'none') return <span className="text-muted-foreground text-sm">—</span>;
    const cfg = PRIORITY_CFG[priority];
    return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span>;
  };

  const columns = [
    {
      key: 'title', header: 'Task',
      render: (t: OutreachTask) => {
        const cfg = TYPE_CFG[t.task_type] || TYPE_CFG.to_do;
        const Icon = cfg.icon;
        return (
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
            <span className="font-medium text-slate-800">{t.title}</span>
          </div>
        );
      },
    },
    {
      key: 'task_type', header: 'Type',
      render: (t: OutreachTask) => {
        const cfg = TYPE_CFG[t.task_type] || TYPE_CFG.to_do;
        return <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>;
      },
    },
    { key: 'priority', header: 'Priority', render: (t: OutreachTask) => getPriorityPill(t.priority) },
    { key: 'status', header: 'Status', render: (t: OutreachTask) => getStatusPill(t.status) },
    {
      key: 'due_date', header: 'Due',
      render: (t: OutreachTask) => t.due_date
        ? <span className={`text-sm ${new Date(t.due_date) < new Date() && t.status === 'scheduled' ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>{format(new Date(t.due_date), 'MMM d, h:mm a')}</span>
        : '—',
    },
    {
      key: 'linked', header: 'Linked to',
      render: (t: OutreachTask) => (
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {t.lead_name && <span className="flex items-center gap-1"><UserPlus className="h-3 w-3" />{t.lead_name}</span>}
          {t.contact_name && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{t.contact_name}</span>}
          {t.company_name && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{t.company_name}</span>}
          {!t.lead_name && !t.contact_name && !t.company_name && '—'}
        </div>
      ),
    },
    {
      key: 'actions', header: 'Actions',
      render: (task: OutreachTask) => (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-xs" onClick={() => toggleComplete(task)}>
            {task.status === 'completed' ? 'Undo' : 'Complete'}
          </Button>
          {canManage && (
            <>
              <button onClick={() => handleEdit(task)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => handleDelete(task)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Outreach Tasks</h1>
          <p className="text-muted-foreground mt-1">Manage follow-up tasks linked to leads, contacts and companies</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetForm(); }}>
          {canAdd && (
            <DialogTrigger asChild>
<Button>
  <Plus className="h-4 w-4 mr-2" /> New Task
</Button>
            </DialogTrigger>
          )}
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingTask ? 'Edit Task' : 'New Task'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2"><Label>Title <span className="text-destructive">*</span></Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Task Type</Label>
                  <Select value={form.task_type} onValueChange={v => setForm({ ...form, task_type: v as TaskType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.entries(TYPE_CFG) as [TaskType, any][]).map(([v, cfg]) => <SelectItem key={v} value={v}>{cfg.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v as TaskPriority })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as TaskStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Due Date</Label><Input type="datetime-local" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
              </div>
              <div className="space-y-2">
                <Label>Reminder</Label>
                <Select value={form.reminder} onValueChange={v => setForm({ ...form, reminder: v as Reminder })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">No reminder</SelectItem><SelectItem value="15min">15 minutes before</SelectItem><SelectItem value="1hour">1 hour before</SelectItem><SelectItem value="1day">1 day before</SelectItem><SelectItem value="2days">2 days before</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <p className="text-sm font-medium">Associate with records</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label className="flex items-center gap-1 text-xs"><UserPlus className="h-3.5 w-3.5" /> Lead</Label><Select value={form.lead_id || '__none__'} onValueChange={v => setForm({ ...form, lead_id: v === '__none__' ? '' : v })}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="__none__">None</SelectItem>{leads.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label className="flex items-center gap-1 text-xs"><Users className="h-3.5 w-3.5" /> Contact</Label><Select value={form.contact_id || '__none__'} onValueChange={v => setForm({ ...form, contact_id: v === '__none__' ? '' : v })}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="__none__">None</SelectItem>{contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label className="flex items-center gap-1 text-xs"><Building2 className="h-3.5 w-3.5" /> Company</Label><Select value={form.company_id || '__none__'} onValueChange={v => setForm({ ...form, company_id: v === '__none__' ? '' : v })}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="__none__">None</SelectItem>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></div>
                </div>
              </div>
              <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief context for this task" /></div>
              <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={4} placeholder="Detailed notes, talking points, outcomes…" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
                <Button type="submit">{editingTask ? 'Update Task' : 'Create Task'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4 md:hidden">
        {tasks.map(task => {
          const cfg = TYPE_CFG[task.task_type] || TYPE_CFG.to_do;
          const Icon = cfg.icon;
          return (
            <MobileCard
              key={task.id}
              title={<span className="flex items-center gap-2"><Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />{task.title}</span>}
              badge={getStatusPill(task.status)}
              details={[
                { label: 'Type', value: cfg.label },
                { label: 'Priority', value: task.priority !== 'none' ? task.priority : '—' },
                { label: 'Due', value: task.due_date ? format(new Date(task.due_date), 'MMM d, h:mm a') : '—' },
                { label: 'Lead', value: task.lead_name || null },
                { label: 'Contact', value: task.contact_name || null },
                { label: 'Company', value: task.company_name || null },
                { label: 'Notes', value: task.notes || null },
              ].filter(d => d.value)}
              actions={
                <>
                  <Button size="sm" variant="outline" className="w-full hover:bg-emerald-50 hover:text-emerald-700" onClick={() => toggleComplete(task)}>
                    {task.status === 'completed' ? 'Mark Incomplete' : 'Mark Complete'}
                  </Button>
                  {canManage && (
                    <>
                      <button onClick={() => handleEdit(task)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(task)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </>
              }
            />
          );
        })}
      </div>

      <div className="hidden md:block">
        <DataTable columns={columns} data={tasks} emptyIcon={ListTodo} emptyTitle="No tasks yet" emptyDescription="Create tasks linked to leads, contacts or companies."
          emptyActionLabel={canAdd ? 'Add your first task' : undefined} onEmptyAction={canAdd ? () => setDialogOpen(true) : undefined} />
      </div>
      <ConfirmDeleteDialog />
    </div>
  );
}