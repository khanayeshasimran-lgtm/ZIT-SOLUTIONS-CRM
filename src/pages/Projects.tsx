import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirmDelete } from '@/hooks/useConfirmDelete';
import { logAudit } from '@/lib/audit';
import { PageLoader } from '@/components/PageLoader';
import { MobileCard } from '@/components/MobileCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { FolderKanban, Plus, Trash2, Pencil } from 'lucide-react';
import { format } from 'date-fns';

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

const STATUS_CFG: Record<string, { label: string; pill: string; dot: string; accent: string }> = {
  active:    { label: 'Active',    pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-400', accent: '#10b981' },
  completed: { label: 'Completed', pill: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',             dot: 'bg-sky-400',     accent: '#0ea5e9' },
  on_hold:   { label: 'On Hold',   pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       dot: 'bg-amber-400',   accent: '#f59e0b' },
};

const AVATAR_COLORS = [
  'from-indigo-400 to-indigo-600', 'from-sky-400 to-sky-600',
  'from-violet-400 to-violet-600', 'from-emerald-400 to-emerald-600',
  'from-amber-400 to-amber-600', 'from-pink-400 to-pink-600',
];

function ProjectAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
      {initials}
    </div>
  );
}

export default function Projects() {
  const { user, role, profile } = useAuth();
  const { toast } = useToast();
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();
  const canManageProjects = role === 'admin' || role === 'manager';

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', status: 'active' as Project['status'], start_date: '', end_date: '', budget: '' });

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

  const resetForm = () => { setFormData({ name: '', description: '', status: 'active', start_date: '', end_date: '', budget: '' }); setEditingProject(null); };

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    const rows = projects.map(p => ({ Name: p.name, Status: p.status, StartDate: p.start_date ?? '—', EndDate: p.end_date ?? '—', Budget: p.budget ?? '—' }));
    if (type === 'csv') exportToCSV('projects', rows);
    if (type === 'excel') exportToExcel('projects', rows);
    if (type === 'pdf') exportToPDF('projects', rows, { title: 'ZIT Solutions – CRM', subtitle: 'Projects Report', exportedBy: profile?.email ?? user?.email ?? 'System' });
    logAudit({ userId: user?.id, userEmail: profile?.email ?? user?.email, action: 'EXPORT', entity: 'projects', entityId: `${type.toUpperCase()} (${rows.length} rows)` });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name: formData.name, description: formData.description || null, status: formData.status, start_date: formData.start_date || null, end_date: formData.end_date || null, budget: parseFloat(formData.budget) || null };
    if (editingProject) {
      const { error } = await supabase.from('projects').update(payload).eq('id', editingProject.id);
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); } else { toast({ title: 'Project updated' }); setIsDialogOpen(false); resetForm(); fetchProjects(); }
    } else {
      const { error } = await supabase.from('projects').insert({ ...payload, created_by: user?.id });
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); } else { toast({ title: 'Project created' }); setIsDialogOpen(false); resetForm(); fetchProjects(); }
    }
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setFormData({ name: project.name, description: project.description || '', status: project.status, start_date: project.start_date || '', end_date: project.end_date || '', budget: project.budget?.toString() || '' });
    setIsDialogOpen(true);
  };

  const handleDelete = (project: Project) => {
    confirm({
      title: `Delete "${project.name}"?`,
      description: 'This action cannot be undone.',
      onConfirm: async () => {
        const { error } = await supabase.from('projects').delete().eq('id', project.id);
        if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
        toast({ title: 'Project deleted' }); fetchProjects();
      },
    });
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  const getStatusPill = (status: string) => {
    const cfg = STATUS_CFG[status] || STATUS_CFG.on_hold;
    return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span>;
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
    { key: 'status', header: 'Status', render: (p: Project) => getStatusPill(p.status) },
    { key: 'start_date', header: 'Start Date', render: (p: Project) => p.start_date ? <span className="text-slate-600 text-sm">{format(new Date(p.start_date), 'MMM d, yyyy')}</span> : '—' },
    { key: 'end_date', header: 'End Date', render: (p: Project) => p.end_date ? <span className="text-slate-600 text-sm">{format(new Date(p.end_date), 'MMM d, yyyy')}</span> : '—' },
    {
      key: 'budget', header: 'Budget',
      render: (p: Project) => p.budget ? <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-2.5 py-0.5 text-xs font-semibold">{formatCurrency(p.budget)}</span> : '—',
    },
    {
      key: 'actions', header: 'Actions',
      render: (project: Project) => (
        <div className="flex items-center gap-1">
          {canManageProjects && (
            <>
              <button onClick={() => handleEdit(project)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => handleDelete(project)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
            </>
          )}
          {role === 'user' && (
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map(star => (
                <button key={star} onClick={() => rateProject(project, star)} className={`text-lg transition-transform hover:scale-125 ${project.rating && project.rating >= star ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'}`}>★</button>
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage client projects</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageProjects && <ExportDropdown onExport={handleExport} />}
          <Dialog open={isDialogOpen} onOpenChange={open => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            {canManageProjects && (
              <DialogTrigger asChild>
<Button>
  <Plus className="h-4 w-4 mr-2" /> Add Project
</Button>
              </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>{editingProject ? 'Edit Project' : 'Add New Project'}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2"><Label>Project Name <span className="text-destructive">*</span></Label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required /></div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={value => setFormData({ ...formData, status: value as Project['status'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} /></div>
                  <div className="space-y-2"><Label>End Date</Label><Input type="date" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Budget ($)</Label><Input type="number" value={formData.budget} onChange={e => setFormData({ ...formData, budget: e.target.value })} /></div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
                  <Button type="submit">{editingProject ? 'Update Project' : 'Create Project'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        {projects.map(project => (
          <MobileCard
            key={project.id}
            title={<span className="flex items-center gap-2"><ProjectAvatar name={project.name} />{project.name}</span>}
            badge={getStatusPill(project.status)}
            details={[
              { label: 'Start', value: project.start_date ? format(new Date(project.start_date), 'MMM d, yyyy') : '—' },
              { label: 'End', value: project.end_date ? format(new Date(project.end_date), 'MMM d, yyyy') : '—' },
              { label: 'Budget', value: project.budget ? formatCurrency(project.budget) : '—' },
              { label: 'Description', value: project.description },
            ]}
            actions={
              <>
                {canManageProjects && (
                  <>
                    <button onClick={() => handleEdit(project)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(project)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
                {role === 'user' && (
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} onClick={() => rateProject(project, star)} className={`text-xl transition-transform hover:scale-125 ${project.rating && project.rating >= star ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'}`}>★</button>
                    ))}
                  </div>
                )}
              </>
            }
          />
        ))}
      </div>

      <div className="hidden md:block">
        <DataTable columns={columns} data={projects} emptyIcon={FolderKanban} emptyTitle="No projects yet"
          emptyDescription={canManageProjects ? 'Create items to get started.' : 'Nothing available to view yet.'}
          emptyActionLabel={canManageProjects ? 'Add first item' : undefined} onEmptyAction={canManageProjects ? () => setIsDialogOpen(true) : undefined} />
      </div>
      <ConfirmDeleteDialog />
    </div>
  );
}