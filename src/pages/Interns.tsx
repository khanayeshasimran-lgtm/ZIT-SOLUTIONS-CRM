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
import { ImportButton } from "@/components/ImportButton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { GraduationCap, Plus, Trash2, Pencil } from 'lucide-react';
import { format } from 'date-fns';

interface Intern {
  id: string;
  intern_name: string;
  domain: string | null;
  status: 'ongoing' | 'completed' | 'on_hold' | 'dropped';
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

const domainOptions = [
  { value: 'Web Development', label: 'Web Development' },
  { value: 'Cybersecurity', label: 'Cybersecurity' },
  { value: 'Android Development', label: 'Android Development' },
  { value: 'UI/Ux design', label: 'UI/UX Design' },
  { value: 'Data Science', label: 'Data Science' },
  { value: 'Java Development', label: 'Java Development' },
  { value: 'Python Development', label: 'Python Development' },
  { value: 'Machine Learning', label: 'Machine Learning' },
  { value: 'Artificial Intelligence', label: 'Artificial Intelligence' },
  { value: 'Backend Development', label: 'Backend Development' },
];

const DOMAIN_COLORS: Record<string, string> = {
  'Web Development':       'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  'Cybersecurity':         'bg-red-50 text-red-700 ring-1 ring-red-200',
  'Android Development':   'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  'UI/Ux design':          'bg-pink-50 text-pink-700 ring-1 ring-pink-200',
  'Data Science':          'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  'Java Development':      'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  'Python Development':    'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  'Machine Learning':      'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  'Artificial Intelligence':'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  'Backend Development':   'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
};

const STATUS_CFG: Record<string, { label: string; pill: string; dot: string }> = {
  ongoing:   { label: 'Ongoing',   pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-400' },
  completed: { label: 'Completed', pill: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',             dot: 'bg-sky-400' },
  on_hold:   { label: 'On Hold',   pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       dot: 'bg-amber-400' },
  dropped:   { label: 'Dropped',   pill: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',      dot: 'bg-slate-400' },
};

const AVATAR_COLORS = [
  'from-indigo-400 to-indigo-600', 'from-sky-400 to-sky-600',
  'from-violet-400 to-violet-600', 'from-emerald-400 to-emerald-600',
  'from-amber-400 to-amber-600', 'from-teal-400 to-teal-600',
];

function InternAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div className={`h-7 w-7 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm`}>
      {initials}
    </div>
  );
}

export default function Interns() {
  const { user, role, profile } = useAuth();
  const { toast } = useToast();
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();
  const canManageInterns = role === 'admin' || role === 'manager';

  const [interns, setInterns] = useState<Intern[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIntern, setEditingIntern] = useState<Intern | null>(null);
  const [formData, setFormData] = useState({ intern_name: '', domain: '', status: 'ongoing' as Intern['status'], start_date: '', end_date: '' });

  const fetchInterns = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('interns').select('*').order('created_at', { ascending: false });
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); }
    else { setInterns((data ?? []) as unknown as Intern[]); }
    setLoading(false);
  };

  useEffect(() => { fetchInterns(); }, [user]);

  const resetForm = () => { setFormData({ intern_name: '', domain: '', status: 'ongoing', start_date: '', end_date: '' }); setEditingIntern(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { intern_name: formData.intern_name, domain: formData.domain || null, status: formData.status, start_date: formData.start_date || null, end_date: formData.end_date || null };
    if (editingIntern) {
      const { error } = await supabase.from('interns').update(payload).eq('id', editingIntern.id);
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Intern updated' });
    } else {
      const { error } = await supabase.from('interns').insert({ ...payload, created_by: user?.id });
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Intern added' });
    }
    setIsDialogOpen(false); resetForm(); fetchInterns();
  };

  const handleEdit = (intern: Intern) => {
    setEditingIntern(intern);
    setFormData({ intern_name: intern.intern_name, domain: intern.domain || '', status: intern.status, start_date: intern.start_date || '', end_date: intern.end_date || '' });
    setIsDialogOpen(true);
  };

  const handleDelete = (intern: Intern) => {
    confirm({
      title: `Delete "${intern.intern_name}"?`,
      description: 'This action cannot be undone.',
      onConfirm: async () => {
        const { error } = await supabase.from('interns').delete().eq('id', intern.id);
        if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
        toast({ title: 'Intern deleted' }); fetchInterns();
      },
    });
  };

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    const rows = interns.map(i => ({ InternName: i.intern_name, Domain: i.domain ?? '—', Status: i.status, StartDate: i.start_date ?? '—', EndDate: i.end_date ?? '—', CreatedAt: format(new Date(i.created_at), 'yyyy-MM-dd') }));
    if (type === 'csv') exportToCSV('interns', rows);
    if (type === 'excel') exportToExcel('interns', rows);
    if (type === 'pdf') exportToPDF('interns', rows, { title: 'ZIT Solutions – CRM', subtitle: 'Interns Report', exportedBy: profile?.email ?? user?.email ?? 'System' });
    logAudit({ userId: user?.id, userEmail: profile?.email ?? user?.email, action: 'EXPORT', entity: 'interns', entityId: `${type.toUpperCase()} (${rows.length} rows)` });
  };

  const getDomainPill = (domain: string | null) => {
    if (!domain) return '—';
    const colorClass = DOMAIN_COLORS[domain] || 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
    return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>{domain}</span>;
  };

  const getStatusPill = (status: string) => {
    const cfg = STATUS_CFG[status] || STATUS_CFG.dropped;
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.pill}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
      </span>
    );
  };

  const columns = [
    {
      key: 'intern_name', header: 'Intern Name',
      render: (i: Intern) => (
        <div className="flex items-center gap-2.5">
          <InternAvatar name={i.intern_name} />
          <span className="font-medium text-slate-800">{i.intern_name}</span>
        </div>
      ),
    },
    { key: 'domain', header: 'Domain', render: (i: Intern) => getDomainPill(i.domain) },
    { key: 'status', header: 'Status', render: (i: Intern) => getStatusPill(i.status) },
    { key: 'start_date', header: 'Start Date', render: (i: Intern) => i.start_date ? <span className="text-slate-600 text-sm">{format(new Date(i.start_date), 'MMM d, yyyy')}</span> : '—' },
    { key: 'end_date', header: 'End Date', render: (i: Intern) => i.end_date ? <span className="text-slate-600 text-sm">{format(new Date(i.end_date), 'MMM d, yyyy')}</span> : '—' },
    ...(canManageInterns ? [{
      key: 'actions', header: 'Actions',
      render: (intern: Intern) => (
        <div className="flex items-center gap-1">
          <button onClick={() => handleEdit(intern)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => handleDelete(intern)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ),
    }] : []),
  ];

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Interns</h1>
          <p className="text-muted-foreground mt-1">Manage intern progress and assignments</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton entity="interns" requiredColumns={['intern_name', 'domain', 'status', 'start_date', 'end_date']} onImport={async (rows: any[]) => { const { error } = await supabase.from('interns').insert(rows); if (error) throw error; fetchInterns(); }} />
          {canManageInterns && <ExportDropdown onExport={handleExport} />}
          {canManageInterns && (
            <Dialog open={isDialogOpen} onOpenChange={open => { setIsDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
<Button>
  <Plus className="h-4 w-4 mr-2" /> Add Intern
</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>{editingIntern ? 'Edit Intern' : 'Add New Intern'}</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2"><Label>Intern Name *</Label><Input value={formData.intern_name} onChange={e => setFormData({ ...formData, intern_name: e.target.value })} required /></div>
                  <div className="space-y-2">
                    <Label>Domain</Label>
                    <Select value={formData.domain} onValueChange={value => setFormData({ ...formData, domain: value })}>
                      <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
                      <SelectContent>{domainOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={value => setFormData({ ...formData, status: value as Intern['status'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ongoing">Ongoing</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="on_hold">On Hold</SelectItem>
                        <SelectItem value="dropped">Dropped</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} /></div>
                    <div className="space-y-2"><Label>End Date</Label><Input type="date" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })} /></div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
                    <Button type="submit">{editingIntern ? 'Update Intern' : 'Add Intern'}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        {interns.map(intern => (
          <MobileCard
            key={intern.id}
            title={<span className="flex items-center gap-2"><InternAvatar name={intern.intern_name} />{intern.intern_name}</span>}
            badge={getDomainPill(intern.domain)}
            details={[
              { label: 'Status', value: getStatusPill(intern.status) },
              { label: 'Start', value: intern.start_date ? format(new Date(intern.start_date), 'MMM d, yyyy') : '—' },
              { label: 'End', value: intern.end_date ? format(new Date(intern.end_date), 'MMM d, yyyy') : '—' },
            ]}
            actions={canManageInterns ? (
              <>
                <button onClick={() => handleEdit(intern)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => handleDelete(intern)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
              </>
            ) : undefined}
          />
        ))}
      </div>

      <div className="hidden md:block">
        <DataTable columns={columns} data={interns} emptyIcon={GraduationCap} emptyTitle="No interns yet" emptyDescription="Add interns to track their progress."
          emptyActionLabel={canManageInterns ? 'Add your first intern' : undefined} onEmptyAction={canManageInterns ? () => setIsDialogOpen(true) : undefined} />
      </div>
      <ConfirmDeleteDialog />
    </div>
  );
}