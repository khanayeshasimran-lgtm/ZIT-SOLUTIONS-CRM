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
import { Textarea } from '@/components/ui/textarea';
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/export';
import { ImportButton } from "@/components/ImportButton";
import { ExportDropdown } from '@/components/ExportDropdown';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Ticket, Plus, Trash2, Pencil, Users, Building2, UserPlus, Bug, Wrench, HelpCircle, Zap } from 'lucide-react';
import { format } from 'date-fns';

type TicketCategory = 'bug' | 'feature_request' | 'support' | 'billing' | 'other';

interface TicketType {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  category: TicketCategory | null;
  assigned_to_email: string | null;
  created_at: string;
  lead_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  lead_name?: string | null;
  contact_name?: string | null;
  company_name?: string | null;
}

interface LinkedRecord { id: string; label: string; }

const PRIORITY_CFG: Record<string, { label: string; pill: string; dot: string }> = {
  low:    { label: 'Low',    pill: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',   dot: 'bg-slate-400' },
  medium: { label: 'Medium', pill: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',          dot: 'bg-sky-400' },
  high:   { label: 'High',   pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',    dot: 'bg-amber-400' },
  urgent: { label: 'Urgent', pill: 'bg-red-50 text-red-700 ring-1 ring-red-200',          dot: 'bg-red-400' },
};

const STATUS_CFG: Record<string, { label: string; pill: string; dot: string }> = {
  open:        { label: 'Open',        pill: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',    dot: 'bg-indigo-400' },
  in_progress: { label: 'In Progress', pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       dot: 'bg-amber-400' },
  resolved:    { label: 'Resolved',    pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-400' },
  closed:      { label: 'Closed',      pill: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',      dot: 'bg-slate-400' },
};

const CATEGORY_CFG: Record<TicketCategory, { label: string; icon: React.ElementType; pill: string }> = {
  bug:             { label: 'Bug',             icon: Bug,        pill: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  feature_request: { label: 'Feature Request', icon: Zap,        pill: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  support:         { label: 'Support',         icon: HelpCircle, pill: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
  billing:         { label: 'Billing',         icon: Ticket,     pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  other:           { label: 'Other',           icon: Wrench,     pill: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
};

export default function Tickets() {
  const { user, role, profile } = useAuth();
  const { toast } = useToast();
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();

  const canManageTickets = role === 'admin' || role === 'manager';
  const canAddTickets    = role === 'admin' || role === 'manager' || role === 'user';
  const canResolveOwn    = (ticket: any) => role === 'user' && ticket.created_by === user?.id;

  const [tickets,  setTickets]  = useState<TicketType[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<TicketType | null>(null);
  const [leads,     setLeads]     = useState<LinkedRecord[]>([]);
  const [contacts,  setContacts]  = useState<LinkedRecord[]>([]);
  const [companies, setCompanies] = useState<LinkedRecord[]>([]);
  const [members,   setMembers]   = useState<{ id: string; email: string }[]>([]);

  const emptyForm = {
    title: '', description: '', notes: '',
    priority: 'medium' as TicketType['priority'],
    status: 'open' as TicketType['status'],
    category: 'support' as TicketCategory,
    assigned_to_email: '', lead_id: '', contact_id: '', company_id: '',
  };
  const [form, setForm] = useState(emptyForm);

  // ─── FIX: single refetch helper that always uses the current state maps ───
  const refetch = (
    lMap  = leads,
    cMap  = contacts,
    coMap = companies,
  ) => fetchTickets(lMap, cMap, coMap);

  const fetchOptions = async () => {
    const [
      { data: leadsData },
      { data: contactsData },
      { data: companiesData },
      { data: profilesData },
    ] = await Promise.all([
      supabase.from('leads').select('id, name').order('name'),
      supabase.from('contacts').select('id, first_name, last_name').order('first_name'),
      supabase.from('companies').select('id, name').order('name'),
      supabase.from('profiles').select('id, email').order('email'),
    ]);

    const mappedLeads     = (leadsData    ?? []).map((l: any) => ({ id: l.id, label: l.name }));
    const mappedContacts  = (contactsData ?? []).map((c: any) => ({ id: c.id, label: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() }));
    const mappedCompanies = (companiesData ?? []).map((c: any) => ({ id: c.id, label: c.name }));

    setLeads(mappedLeads);
    setContacts(mappedContacts);
    setCompanies(mappedCompanies);
    setMembers((profilesData ?? []).map((p: any) => ({ id: p.id, email: p.email })));

    return { mappedLeads, mappedContacts, mappedCompanies };
  };

  const fetchTickets = async (
    lMap:  LinkedRecord[] = [],
    cMap:  LinkedRecord[] = [],
    coMap: LinkedRecord[] = [],
  ) => {
    if (!user) return;
    const { data, error } = await (supabase as any)
      .from('tickets')
      .select('id, title, description, notes, priority, status, category, assigned_to_email, created_at, lead_id, contact_id, company_id, created_by')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      setTickets(
        (data ?? []).map((t: any) => ({
          ...t,
          lead_name:    lMap.find(l  => l.id  === t.lead_id)?.label    ?? null,
          contact_name: cMap.find(c  => c.id  === t.contact_id)?.label ?? null,
          company_name: coMap.find(c => c.id  === t.company_id)?.label ?? null,
        })),
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOptions().then(({ mappedLeads, mappedContacts, mappedCompanies }) => {
      fetchTickets(mappedLeads, mappedContacts, mappedCompanies);
    });
  }, [user]);

  const resetForm = () => { setForm(emptyForm); setEditingTicket(null); };

  const handleEdit = (ticket: TicketType) => {
    setEditingTicket(ticket);
    setForm({
      title:             ticket.title,
      description:       ticket.description       || '',
      notes:             ticket.notes             || '',
      priority:          ticket.priority,
      status:            ticket.status,
      category:          ticket.category          || 'support',
      assigned_to_email: ticket.assigned_to_email || '',
      lead_id:           ticket.lead_id           || '',
      contact_id:        ticket.contact_id        || '',
      company_id:        ticket.company_id        || '',
    });
    setDialogOpen(true);
  };

  // ─── FIX: use refetch() so maps are always passed ───
  const toggleResolve = async (ticket: TicketType) => {
    const newStatus = ticket.status === 'resolved' ? 'open' : 'resolved';
    const { error } = await supabase.from('tickets').update({ status: newStatus }).eq('id', ticket.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }
    toast({ title: newStatus === 'resolved' ? 'Ticket resolved ✓' : 'Ticket reopened' });
    refetch();
  };

  const handleDelete = (ticket: TicketType) => {
    confirm({
      title: `Delete "${ticket.title}"?`,
      description: 'This action cannot be undone.',
      onConfirm: async () => {
        const { error } = await supabase.from('tickets').delete().eq('id', ticket.id);
        if (error) {
          toast({ variant: 'destructive', title: 'Error', description: error.message });
          return;
        }
        toast({ title: 'Ticket deleted' });
        refetch();
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAddTickets) { toast({ variant: 'destructive', title: 'Permission denied' }); return; }

    const payload = {
      title:             form.title,
      description:       form.description       || null,
      notes:             form.notes             || null,
      priority:          form.priority,
      status:            form.status,
      category:          form.category          || null,
      assigned_to_email: form.assigned_to_email || null,
      lead_id:           form.lead_id           || null,
      contact_id:        form.contact_id        || null,
      company_id:        form.company_id        || null,
    };

    if (editingTicket) {
      const { error } = await supabase.from('tickets').update(payload).eq('id', editingTicket.id);
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Ticket updated' });
    } else {
      const { error } = await supabase.from('tickets').insert({ ...payload, created_by: user?.id });
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Ticket created' });
    }

    setDialogOpen(false);
    resetForm();
    refetch();
  };

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    const rows = tickets.map(t => ({
      Title:       t.title,
      Category:    t.category ? CATEGORY_CFG[t.category].label : '—',
      Priority:    t.priority,
      Status:      t.status,
      AssignedTo:  t.assigned_to_email ?? '—',
      Lead:        t.lead_name    ?? '—',
      Contact:     t.contact_name ?? '—',
      Company:     t.company_name ?? '—',
      Description: t.description  ?? '',
      CreatedAt:   format(new Date(t.created_at), 'yyyy-MM-dd'),
    }));
    if (type === 'csv')   exportToCSV('tickets', rows);
    if (type === 'excel') exportToExcel('tickets', rows);
    if (type === 'pdf')   exportToPDF('tickets', rows, {
      title:      'ZIT Solutions – CRM',
      subtitle:   'Tickets Report',
      exportedBy: profile?.email ?? user?.email ?? 'System',
    });
    logAudit({
      userId:    user?.id,
      userEmail: profile?.email ?? user?.email,
      action:    'EXPORT',
      entity:    'tickets',
      entityId:  `${type.toUpperCase()} (${rows.length} rows)`,
    });
  };

  const getPriorityPill = (priority: string) => {
    const cfg = PRIORITY_CFG[priority] || PRIORITY_CFG.low;
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.pill}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    );
  };

  const getStatusPill = (status: string) => {
    const cfg = STATUS_CFG[status] || STATUS_CFG.open;
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.pill}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    );
  };

  const getCategoryPill = (category: TicketCategory | null) => {
    if (!category) return <span className="text-muted-foreground text-sm">—</span>;
    const cfg  = CATEGORY_CFG[category];
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.pill}`}>
        <Icon className="h-3 w-3" />
        {cfg.label}
      </span>
    );
  };

  const columns = [
    {
      key: 'title', header: 'Ticket',
      render: (t: TicketType) => {
        const Icon = t.category ? (CATEGORY_CFG[t.category]?.icon || Ticket) : Ticket;
        return (
          <div className="flex items-start gap-2">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-800">{t.title}</p>
              {t.description && (
                <p className="text-xs text-muted-foreground truncate max-w-xs">{t.description}</p>
              )}
            </div>
          </div>
        );
      },
    },
    { key: 'category', header: 'Category', render: (t: TicketType) => getCategoryPill(t.category) },
    { key: 'priority', header: 'Priority',  render: (t: TicketType) => getPriorityPill(t.priority) },
    { key: 'status',   header: 'Status',    render: (t: TicketType) => getStatusPill(t.status) },
    {
      key: 'linked', header: 'Linked to',
      render: (t: TicketType) => (
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {t.lead_name    && <span className="flex items-center gap-1"><UserPlus  className="h-3 w-3" />{t.lead_name}</span>}
          {t.contact_name && <span className="flex items-center gap-1"><Users     className="h-3 w-3" />{t.contact_name}</span>}
          {t.company_name && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{t.company_name}</span>}
          {!t.lead_name && !t.contact_name && !t.company_name && '—'}
        </div>
      ),
    },
    {
      key: 'assigned_to_email', header: 'Assigned',
      render: (t: TicketType) =>
        t.assigned_to_email
          ? <span className="text-xs text-indigo-600 font-medium">{t.assigned_to_email}</span>
          : '—',
    },
    {
      key: 'created_at', header: 'Created',
      render: (t: TicketType) =>
        <span className="text-slate-500 text-sm">{format(new Date(t.created_at), 'MMM d, yyyy')}</span>,
    },
    {
      key: 'actions', header: 'Actions',
      render: (ticket: TicketType) => (
        <div className="flex items-center gap-1">
          {(canManageTickets || canResolveOwn(ticket)) && (
            <Button
              size="sm" variant="outline"
              className="hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors text-xs"
              onClick={() => toggleResolve(ticket)}
            >
              {ticket.status === 'resolved' ? 'Reopen' : 'Resolve'}
            </Button>
          )}
          {canManageTickets && (
            <>
              <button
                onClick={() => handleEdit(ticket)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleDelete(ticket)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
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
          <h1 className="page-title">Tickets</h1>
          <p className="text-muted-foreground mt-1">Track and resolve support requests</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton
            entity="tickets"
            requiredColumns={['title', 'priority', 'status', 'category']}
            onImport={async (rows: any[]) => {
              const { error } = await supabase.from('tickets').insert(rows);
              if (error) throw error;
              refetch();
            }}
          />
          {canManageTickets && <ExportDropdown onExport={handleExport} />}
          {canAddTickets && (
            <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" /> New Ticket
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingTicket ? 'Edit Ticket' : 'New Ticket'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label>Title <span className="text-destructive">*</span></Label>
                    <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={form.category} onValueChange={v => setForm({ ...form, category: v as TicketCategory })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.entries(CATEGORY_CFG) as [TicketCategory, any][]).map(([v, cfg]) => (
                            <SelectItem key={v} value={v}>{cfg.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v as TicketType['priority'] })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as TicketType['status'] })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Assign to</Label>
                      <Select
                        value={form.assigned_to_email || '__none__'}
                        onValueChange={v => setForm({ ...form, assigned_to_email: v === '__none__' ? '' : v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Unassigned</SelectItem>
                          {members.map(m => <SelectItem key={m.id} value={m.email}>{m.email}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                    <p className="text-sm font-medium">Associate with records</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1 text-xs"><UserPlus className="h-3.5 w-3.5" /> Lead</Label>
                        <Select value={form.lead_id || '__none__'} onValueChange={v => setForm({ ...form, lead_id: v === '__none__' ? '' : v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {leads.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1 text-xs"><Users className="h-3.5 w-3.5" /> Contact</Label>
                        <Select value={form.contact_id || '__none__'} onValueChange={v => setForm({ ...form, contact_id: v === '__none__' ? '' : v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1 text-xs"><Building2 className="h-3.5 w-3.5" /> Company</Label>
                        <Select value={form.company_id || '__none__'} onValueChange={v => setForm({ ...form, company_id: v === '__none__' ? '' : v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      rows={3}
                      placeholder="Describe the issue…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Internal Notes</Label>
                    <Textarea
                      value={form.notes}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                      rows={3}
                      placeholder="Internal notes, troubleshooting steps, resolution details…"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
                    <Button type="submit">{editingTicket ? 'Update Ticket' : 'Create Ticket'}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-4 md:hidden">
        {tickets.map(ticket => {
          const Icon = ticket.category ? (CATEGORY_CFG[ticket.category]?.icon || Ticket) : Ticket;
          return (
            <MobileCard
              key={ticket.id}
              title={<span className="flex items-center gap-2"><Icon className="h-4 w-4 shrink-0" />{ticket.title}</span>}
              badge={getPriorityPill(ticket.priority)}
              details={[
                { label: 'Category', value: ticket.category ? CATEGORY_CFG[ticket.category].label : '—' },
                { label: 'Status',   value: getStatusPill(ticket.status) },
                { label: 'Assigned', value: ticket.assigned_to_email || null },
                { label: 'Lead',     value: ticket.lead_name    || null },
                { label: 'Contact',  value: ticket.contact_name || null },
                { label: 'Company',  value: ticket.company_name || null },
                { label: 'Notes',    value: ticket.notes        || null },
                { label: 'Created',  value: format(new Date(ticket.created_at), 'MMM d, yyyy') },
              ].filter(d => d.value)}
              actions={
                <>
                  {(canManageTickets || canResolveOwn(ticket)) && (
                    <Button
                      size="sm" variant="outline"
                      className="hover:bg-emerald-50 hover:text-emerald-700"
                      onClick={() => toggleResolve(ticket)}
                    >
                      {ticket.status === 'resolved' ? 'Reopen' : 'Resolve'}
                    </Button>
                  )}
                  {canManageTickets && (
                    <>
                      <button onClick={() => handleEdit(ticket)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(ticket)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </>
              }
            />
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={tickets}
          emptyIcon={Ticket}
          emptyTitle="No tickets yet"
          emptyDescription={canManageTickets ? 'Create tickets to track support requests.' : 'Submit a ticket for support.'}
          emptyActionLabel={canAddTickets ? 'Create first ticket' : undefined}
          onEmptyAction={canAddTickets ? () => setDialogOpen(true) : undefined}
        />
      </div>

      <ConfirmDeleteDialog />
    </div>
  );
}