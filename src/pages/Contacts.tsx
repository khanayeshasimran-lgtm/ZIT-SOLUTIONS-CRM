import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocation, useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/DataTable';
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/export';
import { ExportDropdown } from '@/components/ExportDropdown';
import { logAudit } from '@/lib/audit';
import { ImportButton } from "@/components/ImportButton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Users, Plus, Trash2, Pencil, Star } from 'lucide-react';

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  company_id: string | null;
  companies?: { name: string } | null;
  created_at: string;
  created_by?: string | null;
  is_important?: boolean;
}

interface Company {
  id: string;
  name: string;
}

const positionOptions = [
  { value: 'ceo', label: 'CEO' },
  { value: 'cto', label: 'CTO' },
  { value: 'cfo', label: 'CFO' },
  { value: 'manager', label: 'Manager' },
  { value: 'developer', label: 'Developer' },
  { value: 'designer', label: 'Designer' },
  { value: 'sales', label: 'Sales' },
  { value: 'marketing', label: 'Marketing' },
];

const POSITION_COLORS: Record<string, string> = {
  ceo:       'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  cto:       'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  cfo:       'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  manager:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  developer: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  designer:  'bg-pink-50 text-pink-700 ring-1 ring-pink-200',
  sales:     'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  marketing: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
};

const AVATAR_COLORS = [
  'from-indigo-400 to-indigo-600',
  'from-violet-400 to-violet-600',
  'from-sky-400 to-sky-600',
  'from-emerald-400 to-emerald-600',
  'from-amber-400 to-amber-600',
  'from-pink-400 to-pink-600',
];

function ContactAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div className={`h-8 w-8 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
      {initials}
    </div>
  );
}

export default function Contacts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [customPositions, setCustomPositions] = useState<string[]>([]);
  const [showOtherPosition, setShowOtherPosition] = useState(false);
  const [showOtherCompany, setShowOtherCompany] = useState(false);
  const { user, role, profile } = useAuth();
  const canAddContacts = role === 'admin' || role === 'manager' || role === 'user';
  const canEditContacts = role === 'admin' || role === 'manager';
  const canDeleteContacts = role === 'admin' || role === 'manager';
  const canEditOwn = (contact: Contact) => role === 'user' && contact.created_by === user?.id;

  const toggleImportant = async (contact: Contact) => {
    if (role !== 'user') return;
    const { error } = await supabase
      .from('contacts')
      .update({ is_important: !Boolean(contact.is_important) } as any)
      .eq('id', contact.id);
    if (!error) fetchData();
  };

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    position: '',
    company_id: '',
  });

  const fetchData = async () => {
    if (!user) return;
    const [contactsRes, companiesRes] = await Promise.all([
      supabase.from('contacts').select('*, companies(name)').order('created_at', { ascending: false }),
      supabase.from('companies').select('id, name').order('name'),
    ]);
    if (contactsRes.error) {
      toast({ variant: 'destructive', title: 'Error', description: contactsRes.error.message });
    } else {
      setContacts(contactsRes.data || []);
      const positions = contactsRes.data?.map(c => c.position).filter(p => p && !positionOptions.some(o => o.value.toLowerCase() === p.toLowerCase())) || [];
      setCustomPositions([...new Set(positions)]);
    }
    if (!companiesRes.error) setCompanies(companiesRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user, role]);

  useEffect(() => {
    if (location.state?.companyId) {
      setIsDialogOpen(true);
      setFormData(prev => ({ ...prev, company_id: location.state.companyId }));
    }
  }, [location.state]);

  const resetForm = () => {
    setFormData({ first_name: '', last_name: '', email: '', phone: '', position: '', company_id: '' });
    setEditingContact(null);
    setShowOtherPosition(false);
    setShowOtherCompany(false);
  };

  const handleExport = async (type: 'csv' | 'excel' | 'pdf') => {
    const rows = contacts.map(item => ({
      Name: `${item.first_name} ${item.last_name}`,
      Email: item.email,
      Phone: item.phone,
      Position: item.position,
      CreatedAt: new Date(item.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    }));
    if (type === 'csv') exportToCSV('contacts', rows);
    if (type === 'excel') exportToExcel('contacts', rows);
    if (type === 'pdf') exportToPDF('contacts', rows, { title: 'ZIT Solutions – CRM', subtitle: 'Contacts Report', exportedBy: user?.email ?? 'System' });
    await logAudit({ userId: user?.id, userEmail: user?.email, action: 'EXPORT', entity: 'contacts', entityId: `${type.toUpperCase()} (${rows.length} rows)` });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_id) { toast({ variant: 'destructive', title: 'Company required', description: 'A contact must be linked to a company.' }); return; }
    if (showOtherCompany) { toast({ variant: 'destructive', title: 'Company not created', description: 'Please create the company first before linking a contact.' }); return; }
    const payload = {
      first_name: formData.first_name,
      last_name: formData.last_name || null,
      email: formData.email || null,
      phone: formData.phone || null,
      position: formData.position || null,
      company_id: formData.company_id || null,
    };
    const { error } = editingContact
      ? await supabase.from('contacts').update(payload).eq('id', editingContact.id)
      : await supabase.from('contacts').insert(payload);
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
    toast({ title: 'Success', description: editingContact ? 'Contact updated successfully' : 'Contact created successfully' });
    setIsDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleEdit = (contact: Contact) => {
    if (!canEditContacts && !canEditOwn(contact)) return;
    setEditingContact(contact);
    setFormData({ first_name: contact.first_name, last_name: contact.last_name || '', email: contact.email || '', phone: contact.phone || '', position: contact.position || '', company_id: contact.company_id || '' });
    const isCustom = contact.position && !positionOptions.some(o => o.value.toLowerCase() === contact.position!.toLowerCase());
    setShowOtherPosition(!!isCustom);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!canDeleteContacts) return;
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); }
    else { toast({ title: 'Success', description: 'Contact deleted successfully' }); fetchData(); }
  };

  const handlePositionChange = (value: string) => {
    if (value === '__other__') { setShowOtherPosition(true); setFormData({ ...formData, position: '' }); }
    else { setShowOtherPosition(false); setFormData({ ...formData, position: value }); }
  };

  const allPositionOptions = [...positionOptions, ...customPositions.map(p => ({ value: p, label: p }))];

  const getPositionPill = (position: string | null) => {
    if (!position) return null;
    const colorClass = POSITION_COLORS[position.toLowerCase()] || 'bg-slate-50 text-slate-600 ring-1 ring-slate-200';
    return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>{position.toUpperCase()}</span>;
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (c: Contact) => (
        <div className="flex items-center gap-2.5">
          <ContactAvatar name={`${c.first_name} ${c.last_name || ''}`} />
          <span className="font-medium text-slate-800">{`${c.first_name} ${c.last_name || ''}`.trim()}</span>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (c: Contact) => c.email ? <span className="text-sky-600 text-sm">{c.email}</span> : '—' },
    { key: 'phone', header: 'Phone', render: (c: Contact) => <span className="text-slate-500 text-sm">{c.phone || '—'}</span> },
    { key: 'position', header: 'Position', render: (c: Contact) => getPositionPill(c.position) || <span className="text-muted-foreground">—</span> },
    { key: 'company', header: 'Company', render: (c: Contact) => c.companies?.name ? <span className="text-indigo-600 font-medium text-sm">{c.companies.name}</span> : '—' },
    {
      key: 'actions',
      header: 'Actions',
      render: (contact: Contact) => (
        <div className="flex items-center gap-1">
          {(role === 'admin' || role === 'manager') && (
            <>
              <button onClick={() => handleEdit(contact)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => handleDelete(contact.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
            </>
          )}
          {canEditOwn(contact) && (
            <button onClick={() => handleEdit(contact)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
          )}
          {role === 'user' && (
            <button onClick={() => toggleImportant(contact)} className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-500 transition-colors" title="Mark important">
              <Star className={`h-3.5 w-3.5 ${contact.is_important ? 'fill-yellow-400 text-yellow-400' : ''}`} />
            </button>
          )}
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-primary/20 flex items-center justify-center">
            <span className="text-xl font-bold text-primary">Z</span>
          </div>
          <p className="text-muted-foreground text-sm">Loading..</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="text-muted-foreground mt-1">Manage your business contacts</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={open => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <div className="flex items-center gap-2">
            <ImportButton entity="contacts" requiredColumns={['first_name', 'last_name', 'email', 'phone', 'position', 'company_id']} onImport={async (rows: any[]) => { const { error } = await supabase.from('contacts').insert(rows); if (error) throw error; fetchData(); }} />
            {role === 'admin' && <ExportDropdown onExport={handleExport} />}
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Add Contact
              </Button>
            </DialogTrigger>
          </div>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editingContact ? 'Edit Contact' : 'Add New Contact'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name <span className="text-destructive">*</span></Label>
                  <Input id="first_name" value={formData.first_name} onChange={e => setFormData({ ...formData, first_name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input id="last_name" value={formData.last_name} onChange={e => setFormData({ ...formData, last_name: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Position</Label>
                {!showOtherPosition ? (
                  <Select value={formData.position} onValueChange={handlePositionChange}>
                    <SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger>
                    <SelectContent>
                      {allPositionOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      <SelectItem value="__other__" className="text-muted-foreground">Other…</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex gap-2">
                    <Input value={formData.position} onChange={e => setFormData({ ...formData, position: e.target.value })} placeholder="Enter custom position..." />
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setShowOtherPosition(false); setFormData({ ...formData, position: '' }); }}>Cancel</Button>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Select value={formData.company_id} onValueChange={value => { if (value === '__other__') { setShowOtherCompany(true); setFormData({ ...formData, company_id: '' }); } else { setShowOtherCompany(false); setFormData({ ...formData, company_id: value }); } }}>
                  <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                  <SelectContent>
                    {companies.map(company => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}
                    <SelectItem value="__other__" className="text-muted-foreground">Other…</SelectItem>
                  </SelectContent>
                </Select>
                {showOtherCompany && (
                  <div className="flex items-center justify-between rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    <span>Company not found.</span>
                    <Button type="button" variant="link" className="px-0" onClick={() => navigate('/companies')}>+ Create company</Button>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
                <Button type="submit" className="bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white">{editingContact ? 'Update Contact' : 'Create Contact'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Mobile */}
      <div className="space-y-4 md:hidden">
        {contacts.map(contact => (
          <div key={contact.id} className="rounded-xl border border-slate-200/80 bg-white p-4 space-y-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-shadow">
            <div className="flex items-center gap-2.5">
              <ContactAvatar name={`${contact.first_name} ${contact.last_name || ''}`} />
              <span className="font-semibold text-slate-800">{contact.first_name} {contact.last_name || ''}</span>
              {getPositionPill(contact.position)}
            </div>
            <div className="text-sm space-y-1 text-muted-foreground">
              {contact.email && <div><span className="font-medium text-foreground">Email:</span> <span className="text-sky-600">{contact.email}</span></div>}
              {contact.phone && <div><span className="font-medium text-foreground">Phone:</span> {contact.phone}</div>}
              {contact.companies?.name && <div><span className="font-medium text-foreground">Company:</span> <span className="text-indigo-600 font-medium">{contact.companies.name}</span></div>}
            </div>
            <div className="flex gap-2 pt-2">
              {canEditContacts && <button onClick={() => handleEdit(contact)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-4 w-4" /></button>}
              {canEditOwn(contact) && <button onClick={() => handleEdit(contact)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-4 w-4" /></button>}
              {canDeleteContacts && <button onClick={() => handleDelete(contact.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <DataTable columns={columns} data={contacts} emptyIcon={Users} emptyTitle="No contacts yet" emptyDescription="Start adding contacts to build your network." emptyActionLabel="Add your first contact"
          onEmptyAction={() => { if (companies.length === 0) { navigate('/companies'); } else { setIsDialogOpen(true); } }} />
      </div>
    </div>
  );
}