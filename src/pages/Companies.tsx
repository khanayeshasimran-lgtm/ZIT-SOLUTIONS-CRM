import { useState, useEffect } from 'react';
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
import { useNavigate } from 'react-router-dom';
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
import { Building2, Plus, Trash2, Pencil, Star } from 'lucide-react';

interface Company {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  created_by?: string | null;
  contacts?: { id: string; first_name: string; last_name: string }[];
  contacts_count?: number;
  deals_count?: number;
  total_value?: number;
}

const industryOptions = [
  { value: 'technology', label: 'Technology' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'finance', label: 'Finance' },
  { value: 'retail', label: 'Retail' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'education', label: 'Education' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'real_estate', label: 'Real Estate' },
];

const INDUSTRY_COLORS: Record<string, string> = {
  technology:    'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  healthcare:    'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  finance:       'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  retail:        'bg-pink-50 text-pink-700 ring-1 ring-pink-200',
  manufacturing: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  education:     'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  consulting:    'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  real_estate:   'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
};

const AVATAR_COLORS = [
  'from-indigo-400 to-indigo-600',
  'from-sky-400 to-sky-600',
  'from-violet-400 to-violet-600',
  'from-emerald-400 to-emerald-600',
  'from-amber-400 to-amber-600',
  'from-pink-400 to-pink-600',
];

function CompanyAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
      {initials}
    </div>
  );
}


// ── Zod validation schema ─────────────────────────────────────────────────────
const CompanyFormSchema = z.object({
  name:     z.string().min(2, 'Company name must be at least 2 characters').max(120, 'Too long').trim(),
  industry: z.string().max(80, 'Too long').optional().or(z.literal('')),
  website:  z.string().url('Invalid URL — include https://').or(z.literal('')).optional(),
  phone:    z.string().min(6, 'Phone too short').max(30, 'Too long').or(z.literal('')).optional(),
  address:  z.string().max(200, 'Too long').optional().or(z.literal('')),
});
type CompanyFormErrors = Partial<Record<keyof z.infer<typeof CompanyFormSchema>, string>>;

export default function Companies() {
  const { user, role, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formErrors, setFormErrors] = useState<CompanyFormErrors>({});
  const [customIndustries, setCustomIndustries] = useState<string[]>([]);
  const [showOtherIndustry, setShowOtherIndustry] = useState(false);
  const [showAddContactPrompt, setShowAddContactPrompt] = useState(false);
  const [newCompanyId, setNewCompanyId] = useState<string | null>(null);
  const [importantCompanies, setImportantCompanies] = useState<string[]>([]);

  const canManage = role === 'admin' || role === 'manager';
  const canEditOwn = (company: Company) => role === 'user' && company.created_by === user?.id;

  const [formData, setFormData] = useState({ name: '', industry: '', website: '', phone: '', address: '' });

  const toggleImportant = (companyId: string) => {
    setImportantCompanies(prev => prev.includes(companyId) ? prev.filter(id => id !== companyId) : [...prev, companyId]);
  };

  const fetchCompanies = async () => {
    if (!user) return;
    const { data: companiesData, error } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); setLoading(false); return; }
    const industries = (companiesData || []).map(c => c.industry).filter(i => i && !industryOptions.some(o => o.value.toLowerCase() === i.toLowerCase())) as string[];
    setCustomIndustries([...new Set(industries)]);
    const companiesWithCounts = await Promise.all((companiesData || []).map(async company => {
      const [contactsRes, dealsRes] = await Promise.all([
        supabase.from('contacts').select('id, first_name, last_name').eq('company_id', company.id),
        (supabase as any).from('deals').select('id, value').eq('company_id', company.id),
      ]);
      return { ...company, contacts: contactsRes.data || [], contacts_count: contactsRes.data?.length || 0, deals_count: dealsRes.data?.length || 0, total_value: dealsRes.data?.reduce((sum: number, d: any) => sum + (Number(d.value) || 0), 0) || 0 };
    }));
    setCompanies(companiesWithCounts);
    setLoading(false);
  };

  useEffect(() => { fetchCompanies(); }, [user]);

  const resetForm = () => { setFormErrors({}); setFormData({ name: '', industry: '', website: '', phone: '', address: '' }); setEditingCompany(null); setShowOtherIndustry(false); };

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    const rows = companies.map(item => ({ Name: item.name, Industry: item.industry, Website: item.website, Phone: item.phone, Address: item.address }));
    if (type === 'csv') exportToCSV('companies', rows);
    if (type === 'excel') exportToExcel('companies', rows);
    if (type === 'pdf') exportToPDF('companies', rows, { title: 'ZIT Solutions – CRM', subtitle: 'Companies Report', exportedBy: profile?.email ?? user?.email ?? 'System' });
    logAudit({ userId: user?.id, userEmail: profile?.email ?? user?.email, action: 'EXPORT', entity: 'companies', entityId: `${type.toUpperCase()} (${rows.length} rows)` });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ── Zod validation ────────────────────────────────────────────────────────
    const result = CompanyFormSchema.safeParse(formData);
    if (!result.success) {
      const errs: CompanyFormErrors = {};
      result.error.errors.forEach(e => { if (e.path[0]) errs[e.path[0] as keyof CompanyFormErrors] = e.message; });
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    const payload = { name: formData.name, industry: formData.industry || null, website: formData.website || null, phone: formData.phone || null, address: formData.address || null };
    if (editingCompany) {
      const { error } = await supabase.from('companies').update(payload).eq('id', editingCompany.id);
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); } else { toast({ title: 'Company updated' }); setIsDialogOpen(false); resetForm(); fetchCompanies(); }
    } else {
      const { data: existingCompany } = await supabase.from('companies').select('id, name').ilike('name', formData.name.trim()).maybeSingle();
      if (existingCompany) { toast({ variant: 'destructive', title: 'Company already exists', description: `A company named "${existingCompany.name}" already exists.` }); return; }
      const { data, error } = await supabase.from('companies').insert({ ...payload, created_by: user?.id }).select().single();
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      setIsDialogOpen(false); resetForm(); fetchCompanies(); setNewCompanyId(data.id); setShowAddContactPrompt(true);
    }
  };

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    setFormData({ name: company.name, industry: company.industry || '', website: company.website || '', phone: company.phone || '', address: company.address || '' });
    const isCustom = company.industry && !industryOptions.some(o => o.value.toLowerCase() === company.industry!.toLowerCase());
    setShowOtherIndustry(!!isCustom);
    setIsDialogOpen(true);
  };

  const handleDelete = (company: Company) => {
    if (!canManage && !canEditOwn(company)) return;
    confirm({
      title: `Delete "${company.name}"?`,
      description: 'This will permanently delete the company.',
      onConfirm: async () => {
        const { error } = await supabase.from('companies').delete().eq('id', company.id);
        if (error) {
          if (error.message.includes('violates foreign key')) { toast({ variant: 'destructive', title: 'Cannot delete company', description: 'This company has contacts. Delete them first.' }); return; }
          toast({ variant: 'destructive', title: 'Error', description: error.message }); return;
        }
        toast({ title: 'Company deleted' }); fetchCompanies();
      },
    });
  };

  const handleIndustryChange = (value: string) => {
    if (value === '__other__') { setShowOtherIndustry(true); setFormData({ ...formData, industry: '' }); }
    else { setShowOtherIndustry(false); setFormData({ ...formData, industry: value }); }
  };

  const allIndustryOptions = [...industryOptions, ...customIndustries.map(i => ({ value: i, label: i }))];

  const getIndustryPill = (industry: string | null) => {
    if (!industry) return '—';
    const colorClass = INDUSTRY_COLORS[industry.toLowerCase()] || 'bg-slate-50 text-slate-600 ring-1 ring-slate-200';
    return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>{industry.charAt(0).toUpperCase() + industry.slice(1)}</span>;
  };

  const columns = [
    {
      key: 'name', header: 'Company',
      render: (c: Company) => (
        <div className="flex items-center gap-2.5">
          <CompanyAvatar name={c.name} />
          <span className="font-semibold text-slate-800">{c.name}</span>
        </div>
      ),
    },
    { key: 'industry', header: 'Industry', render: (c: Company) => getIndustryPill(c.industry) },
    { key: 'phone', header: 'Phone', render: (c: Company) => <span className="text-slate-500 text-sm">{c.phone || '—'}</span> },
    {
      key: 'website', header: 'Website',
      render: (c: Company) => c.website ? (
        <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-sky-600 underline text-sm hover:text-sky-700" onClick={e => e.stopPropagation()}>Visit</a>
      ) : '—',
    },
    {
      key: 'contacts_count', header: 'Contacts',
      render: (c: Company) => <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 px-2.5 py-0.5 text-xs font-semibold">{c.contacts_count || 0}</span>,
    },
    { key: 'contacts', header: 'Contact Name', render: (c: Company) => c.contacts?.length ? <span className="text-slate-600 text-sm">{c.contacts.map(ct => `${ct.first_name} ${ct.last_name || ''}`).join(', ')}</span> : '—' },
    {
      key: 'actions', header: 'Actions',
      render: (company: Company) => (
        <div className="flex items-center gap-1">
          {canManage && (
            <>
              <button onClick={() => handleEdit(company)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => handleDelete(company)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
            </>
          )}
          {canEditOwn(company) && (
            <button onClick={() => handleEdit(company)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
          )}
          {role === 'user' && (
            <button onClick={() => toggleImportant(company.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-500 transition-colors" title="Mark important">
              <Star className={`h-3.5 w-3.5 ${importantCompanies.includes(company.id) ? 'fill-yellow-400 text-yellow-400' : ''}`} />
            </button>
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
          <h1 className="page-title">Companies</h1>
          <p className="text-muted-foreground mt-1">Manage your business accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton entity="companies" requiredColumns={['name', 'industry', 'website', 'phone', 'address']} onImport={async (rows: any[]) => { const { error } = await supabase.from('companies').insert(rows); if (error) throw error; fetchCompanies(); }} />
                                {role === 'admin' && <ExportDropdown onExport={handleExport} />}

          <Dialog open={isDialogOpen} onOpenChange={open => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            {(canManage || role === 'user') && (
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" /> Add Company
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>{editingCompany ? 'Edit Company' : 'Add New Company'}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name">Company Name <span className="text-destructive">*</span></Label>
                  <Input id="name" value={formData.name} className={formErrors.name ? 'border-destructive' : ''} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  {!showOtherIndustry ? (
                    <Select value={formData.industry} onValueChange={handleIndustryChange}>
                      <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                      <SelectContent className="bg-popover border border-border shadow-lg z-50">
                        {allIndustryOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                        <SelectItem value="__other__" className="text-muted-foreground">Other...</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex gap-2">
                      <Input value={formData.industry} onChange={e => setFormData({ ...formData, industry: e.target.value })} placeholder="Enter custom industry..." className="flex-1" />
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setShowOtherIndustry(false); setFormData({ ...formData, industry: '' }); }}>Cancel</Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" value={formData.website} onChange={e => setFormData({ ...formData, website: e.target.value })} placeholder="https://example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
                  <Button type="submit" className="bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white">{editingCompany ? 'Update Company' : 'Create Company'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Add contact prompt */}
      <Dialog open={showAddContactPrompt} onOpenChange={setShowAddContactPrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add a contact?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Your company has been created. Would you like to add a contact for it now?</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => { setShowAddContactPrompt(false); setNewCompanyId(null); }}>Not now</Button>
            <Button className="bg-gradient-to-br from-sky-500 to-indigo-600 text-white" onClick={() => { setShowAddContactPrompt(false); navigate('/contacts', { state: { companyId: newCompanyId } }); }}>Add Contact</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile */}
      <div className="space-y-4 md:hidden">
        {companies.map(company => (
          <MobileCard
            key={company.id}
            title={<span className="flex items-center gap-2"><CompanyAvatar name={company.name} />{company.name}</span>}
            details={[
              { label: 'Industry', value: company.industry || '—' },
              { label: 'Phone', value: company.phone || '—' },
              { label: 'Contacts', value: company.contacts_count || 0 },
            ]}
            actions={
              <>
                {canEditOwn(company) && <button onClick={() => handleEdit(company)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-4 w-4" /></button>}
                {role === 'user' && <button onClick={() => toggleImportant(company.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-500 transition-colors"><Star className={`h-4 w-4 ${importantCompanies.includes(company.id) ? 'fill-yellow-400 text-yellow-400' : ''}`} /></button>}
                {canManage && (
                  <>
                    <button onClick={() => handleEdit(company)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(company)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </>
            }
          />
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <DataTable columns={columns} data={companies} emptyIcon={Building2} emptyTitle="No companies yet" emptyDescription="Start adding companies to track your business accounts."
          emptyActionLabel={(canManage || role === 'user') ? 'Add your first company' : undefined} onEmptyAction={(canManage || role === 'user') ? () => setIsDialogOpen(true) : undefined} />
      </div>

      <ConfirmDeleteDialog />
    </div>
  );
}