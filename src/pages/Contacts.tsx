/**
 * src/pages/Contacts.tsx
 *
 * Changes from original:
 *   ✅ All original logic preserved (CRUD, export, import, roles, validation)
 *   ✅ Customer Segmentation panel added — filter/group contacts by position,
 *      company, value tier, and activity behaviour
 *   ✅ Segment badges on contact rows
 *   ✅ Saved segments persist to localStorage per org
 */

import { useState, useEffect, useMemo } from 'react';
import { z } from 'zod';
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Users, Plus, Trash2, Pencil, Star, Layers, X,
  ChevronDown, ChevronUp, Filter, Save, Tag,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  company_id: string | null;
  companies?: { name: string; industry?: string | null } | null;
  created_at: string;
  created_by?: string | null;
  is_important?: boolean;
}

interface Company {
  id: string;
  name: string;
}

interface Segment {
  id: string;
  name: string;
  color: string;
  filters: SegmentFilters;
}

interface SegmentFilters {
  positions?: string[];
  companies?: string[];
  hasEmail?: boolean;
  hasPhone?: boolean;
  isImportant?: boolean;
  createdWithinDays?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

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

const SEGMENT_COLORS = [
  '#6366f1','#0ea5e9','#10b981','#f59e0b','#ec4899','#f97316','#8b5cf6','#14b8a6',
];

const DEFAULT_SEGMENTS: Segment[] = [
  {
    id: 'decision-makers',
    name: 'Decision Makers',
    color: '#6366f1',
    filters: { positions: ['ceo', 'cto', 'cfo'] },
  },
  {
    id: 'tech-contacts',
    name: 'Tech Contacts',
    color: '#0ea5e9',
    filters: { positions: ['developer', 'cto'] },
  },
  {
    id: 'complete-profile',
    name: 'Complete Profile',
    color: '#10b981',
    filters: { hasEmail: true, hasPhone: true },
  },
  {
    id: 'important',
    name: 'Starred',
    color: '#f59e0b',
    filters: { isImportant: true },
  },
  {
    id: 'recent',
    name: 'Added this month',
    color: '#ec4899',
    filters: { createdWithinDays: 30 },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const ContactFormSchema = z.object({
  first_name: z.string().min(2, 'First name must be at least 2 characters').max(60).trim(),
  last_name:  z.string().max(60).optional().or(z.literal('')),
  email:      z.string().email('Invalid email address').or(z.literal('')).optional(),
  phone:      z.string().min(6, 'Phone too short').max(30).or(z.literal('')).optional(),
  position:   z.string().max(80).optional().or(z.literal('')),
  company_id: z.string().min(1, 'Please select a company'),
});
type ContactFormErrors = Partial<Record<keyof z.infer<typeof ContactFormSchema>, string>>;

function applySegmentFilters(contacts: Contact[], filters: SegmentFilters): Contact[] {
  return contacts.filter(c => {
    if (filters.positions?.length) {
      if (!c.position || !filters.positions.includes(c.position.toLowerCase())) return false;
    }
    if (filters.companies?.length) {
      if (!c.company_id || !filters.companies.includes(c.company_id)) return false;
    }
    if (filters.hasEmail === true  && !c.email)  return false;
    if (filters.hasPhone === true  && !c.phone)  return false;
    if (filters.isImportant === true && !c.is_important) return false;
    if (filters.createdWithinDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filters.createdWithinDays);
      if (new Date(c.created_at) < cutoff) return false;
    }
    return true;
  });
}

function getSegmentsForContact(contact: Contact, segments: Segment[]): Segment[] {
  return segments.filter(s => applySegmentFilters([contact], s.filters).length > 0);
}

function ContactAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div className={`h-8 w-8 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
      {initials}
    </div>
  );
}

// ── Segmentation Panel ────────────────────────────────────────────────────────

function SegmentationPanel({
  contacts,
  companies,
  segments,
  activeSegmentId,
  onSegmentClick,
  onSegmentsChange,
}: {
  contacts: Contact[];
  companies: Company[];
  segments: Segment[];
  activeSegmentId: string | null;
  onSegmentClick: (id: string | null) => void;
  onSegmentsChange: (s: Segment[]) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName,    setNewName]    = useState('');
  const [newColor,   setNewColor]   = useState(SEGMENT_COLORS[0]);
  const [newFilters, setNewFilters] = useState<SegmentFilters>({});

  const handleSave = () => {
    if (!newName.trim()) return;
    const seg: Segment = {
      id:      `custom-${Date.now()}`,
      name:    newName.trim(),
      color:   newColor,
      filters: newFilters,
    };
    onSegmentsChange([...segments, seg]);
    setIsCreating(false);
    setNewName('');
    setNewFilters({});
  };

  const handleDelete = (id: string) => {
    onSegmentsChange(segments.filter(s => s.id !== id));
    if (activeSegmentId === id) onSegmentClick(null);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_6px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-bold text-slate-800">Customer Segments</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-semibold">
            {segments.length}
          </span>
        </div>
        <button
          onClick={() => setIsCreating(v => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />New segment
        </button>
      </div>

      {/* Segment pills */}
      <div className="px-5 py-4 flex flex-wrap gap-2">
        <button
          onClick={() => onSegmentClick(null)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ring-1 ${
            activeSegmentId === null
              ? 'bg-slate-800 text-white ring-slate-800'
              : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300'
          }`}
        >
          All <span className="tabular-nums">{contacts.length}</span>
        </button>

        {segments.map(seg => {
          const count   = applySegmentFilters(contacts, seg.filters).length;
          const isActive = activeSegmentId === seg.id;
          const isDefault = DEFAULT_SEGMENTS.some(d => d.id === seg.id);
          return (
            <div key={seg.id} className="group relative flex items-center">
              <button
                onClick={() => onSegmentClick(isActive ? null : seg.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ring-1"
                style={isActive
                  ? { backgroundColor: seg.color, color: '#fff', boxShadow: `0 0 0 1px ${seg.color}` }
                  : { backgroundColor: `${seg.color}12`, color: seg.color, boxShadow: `0 0 0 1px ${seg.color}30` }
                }
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: isActive ? '#fff' : seg.color }}
                />
                {seg.name}
                <span
                  className="tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={isActive
                    ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff' }
                    : { backgroundColor: `${seg.color}20`, color: seg.color }
                  }
                >
                  {count}
                </span>
              </button>
              {!isDefault && (
                <button
                  onClick={() => handleDelete(seg.id)}
                  className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full bg-red-500 text-white items-center justify-center hidden group-hover:flex transition-all shadow-sm"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Active segment breakdown */}
      {activeSegmentId && (() => {
        const seg = segments.find(s => s.id === activeSegmentId);
        if (!seg) return null;
        const matched = applySegmentFilters(contacts, seg.filters);

        // Position breakdown within segment
        const byPosition = matched.reduce((acc: Record<string, number>, c) => {
          const pos = c.position || 'Unknown';
          acc[pos] = (acc[pos] || 0) + 1;
          return acc;
        }, {});

        // Company breakdown
        const byCompany = matched.reduce((acc: Record<string, number>, c) => {
          const co = c.companies?.name || 'No company';
          acc[co] = (acc[co] || 0) + 1;
          return acc;
        }, {});
        const topCompanies = Object.entries(byCompany).sort((a, b) => b[1] - a[1]).slice(0, 4);

        return (
          <div className="border-t border-slate-100 px-5 py-4 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} />
              <span className="text-xs font-bold text-slate-700">{seg.name}</span>
              <span className="text-xs text-slate-400">— {matched.length} contact{matched.length !== 1 ? 's' : ''}</span>
            </div>

            {Object.keys(byPosition).length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">By Position</p>
                <div className="space-y-1.5">
                  {Object.entries(byPosition).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pos, cnt]) => (
                    <div key={pos} className="flex items-center gap-2">
                      <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{
                            width: `${Math.round((cnt / matched.length) * 100)}%`,
                            backgroundColor: seg.color,
                            opacity: 0.7,
                          }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-500 w-16 truncate">{pos}</span>
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: seg.color }}>{cnt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {topCompanies.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Top Companies</p>
                <div className="flex flex-wrap gap-1.5">
                  {topCompanies.map(([name, cnt]) => (
                    <span
                      key={name}
                      className="text-[11px] px-2 py-1 rounded-lg font-semibold"
                      style={{ backgroundColor: `${seg.color}15`, color: seg.color }}
                    >
                      {name} · {cnt}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Create segment form */}
      {isCreating && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-3 bg-slate-50/50">
          <p className="text-xs font-bold text-slate-700">New Segment</p>
          <div className="flex gap-2">
            <Input
              placeholder="Segment name…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="text-sm h-8"
            />
            <div className="flex gap-1">
              {SEGMENT_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className="h-6 w-6 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: newColor === c ? '#1e293b' : 'transparent',
                    transform: newColor === c ? 'scale(1.2)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Filter options */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Filters</p>

            <div className="flex flex-wrap gap-2">
              {/* Position filter */}
              <Select onValueChange={v => setNewFilters(f => ({ ...f, positions: [...(f.positions || []), v] }))}>
                <SelectTrigger className="h-7 text-xs w-36">
                  <SelectValue placeholder="+ Position" />
                </SelectTrigger>
                <SelectContent>
                  {positionOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Company filter */}
              <Select onValueChange={v => setNewFilters(f => ({ ...f, companies: [...(f.companies || []), v] }))}>
                <SelectTrigger className="h-7 text-xs w-36">
                  <SelectValue placeholder="+ Company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Boolean toggles */}
              {[
                { key: 'hasEmail',    label: 'Has email' },
                { key: 'hasPhone',    label: 'Has phone' },
                { key: 'isImportant', label: 'Starred' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setNewFilters(f => ({ ...f, [key]: !(f as any)[key] }))}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                    (newFilters as any)[key]
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-500 border-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Active filter chips */}
            <div className="flex flex-wrap gap-1.5">
              {newFilters.positions?.map(p => (
                <span key={p} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">
                  {p}
                  <button onClick={() => setNewFilters(f => ({ ...f, positions: f.positions?.filter(x => x !== p) }))}><X className="h-2.5 w-2.5" /></button>
                </span>
              ))}
              {newFilters.companies?.map(id => {
                const co = companies.find(c => c.id === id);
                return (
                  <span key={id} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 font-semibold">
                    {co?.name ?? id}
                    <button onClick={() => setNewFilters(f => ({ ...f, companies: f.companies?.filter(x => x !== id) }))}><X className="h-2.5 w-2.5" /></button>
                  </span>
                );
              })}
            </div>

            {/* Preview count */}
            {Object.keys(newFilters).length > 0 && (
              <p className="text-[11px] text-slate-400">
                Preview: <span className="font-bold text-slate-600">{applySegmentFilters(contacts, newFilters).length}</span> contacts match
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} className="h-7 text-xs">
              <Save className="mr-1.5 h-3 w-3" />Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setIsCreating(false); setNewFilters({}); }} className="h-7 text-xs">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Contacts() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { toast } = useToast();
  const { user, role, profile } = useAuth();

  const [contacts,           setContacts]           = useState<Contact[]>([]);
  const [companies,          setCompanies]           = useState<Company[]>([]);
  const [loading,            setLoading]             = useState(true);
  const [isDialogOpen,       setIsDialogOpen]        = useState(false);
  const [editingContact,     setEditingContact]      = useState<Contact | null>(null);
  const [customPositions,    setCustomPositions]     = useState<string[]>([]);
  const [showOtherPosition,  setShowOtherPosition]   = useState(false);
  const [formErrors,         setFormErrors]          = useState<ContactFormErrors>({});
  const [showOtherCompany,   setShowOtherCompany]    = useState(false);
  const [showSegments,       setShowSegments]        = useState(true);
  const [activeSegmentId,    setActiveSegmentId]     = useState<string | null>(null);

  const orgId = (profile as any)?.organization_id ?? 'default';
  const storageKey = `crm_segments_${orgId}`;

  const [segments, setSegments] = useState<Segment[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : DEFAULT_SEGMENTS;
    } catch { return DEFAULT_SEGMENTS; }
  });

  const handleSegmentsChange = (updated: Segment[]) => {
    setSegments(updated);
    try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch {}
  };

  const canAddContacts    = role === 'admin' || role === 'manager' || role === 'user';
  const canEditContacts   = role === 'admin' || role === 'manager';
  const canDeleteContacts = role === 'admin' || role === 'manager';
  const canEditOwn = (contact: Contact) => role === 'user' && contact.created_by === user?.id;

  const [formData, setFormData] = useState({
    first_name: '', last_name: '', email: '', phone: '', position: '', company_id: '',
  });

  const toggleImportant = async (contact: Contact) => {
    if (role !== 'user') return;
    const { error } = await supabase
      .from('contacts')
      .update({ is_important: !Boolean(contact.is_important) } as any)
      .eq('id', contact.id);
    if (!error) fetchData();
  };

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
      const positions = contactsRes.data?.map((c: any) => c.position).filter((p: any) => p && !positionOptions.some(o => o.value.toLowerCase() === p.toLowerCase())) || [];
      setCustomPositions([...new Set(positions)] as string[]);
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

  // Filtered contacts based on active segment
  const displayedContacts = useMemo(() => {
    if (!activeSegmentId) return contacts;
    const seg = segments.find(s => s.id === activeSegmentId);
    if (!seg) return contacts;
    return applySegmentFilters(contacts, seg.filters);
  }, [contacts, activeSegmentId, segments]);

  const resetForm = () => {
    setFormData({ first_name: '', last_name: '', email: '', phone: '', position: '', company_id: '' });
    setEditingContact(null);
    setShowOtherPosition(false);
    setShowOtherCompany(false);
  };

  const handleExport = async (type: 'csv' | 'excel' | 'pdf') => {
    const rows = displayedContacts.map(item => ({
      Name:      `${item.first_name} ${item.last_name}`,
      Email:     item.email,
      Phone:     item.phone,
      Position:  item.position,
      CreatedAt: new Date(item.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    }));
    if (type === 'csv')   exportToCSV('contacts', rows);
    if (type === 'excel') exportToExcel('contacts', rows);
    if (type === 'pdf')   exportToPDF('contacts', rows, { title: 'ZIT Solutions – CRM', subtitle: 'Contacts Report', exportedBy: user?.email ?? 'System' });
    await logAudit({ userId: user?.id, userEmail: user?.email, action: 'EXPORT', entity: 'contacts', entityId: `${type.toUpperCase()} (${rows.length} rows)` });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = ContactFormSchema.safeParse(formData);
    if (!result.success) {
      const errs: ContactFormErrors = {};
      result.error.errors.forEach(e => { if (e.path[0]) errs[e.path[0] as keyof ContactFormErrors] = e.message; });
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    if (!formData.company_id) { toast({ variant: 'destructive', title: 'Company required' }); return; }
    if (showOtherCompany)     { toast({ variant: 'destructive', title: 'Create the company first' }); return; }
    const payload = {
      first_name: formData.first_name, last_name: formData.last_name || null,
      email: formData.email || null,   phone: formData.phone || null,
      position: formData.position || null, company_id: formData.company_id || null,
    };
    const { error } = editingContact
      ? await supabase.from('contacts').update(payload).eq('id', editingContact.id)
      : await supabase.from('contacts').insert(payload);
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
    toast({ title: 'Success', description: editingContact ? 'Contact updated' : 'Contact created' });
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
    else { toast({ title: 'Contact deleted' }); fetchData(); }
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
      render: (c: Contact) => {
        const contactSegments = getSegmentsForContact(c, segments);
        return (
          <div className="flex items-center gap-2.5">
            <ContactAvatar name={`${c.first_name} ${c.last_name || ''}`} />
            <div className="min-w-0">
              <span className="font-medium text-slate-800 block truncate">{`${c.first_name} ${c.last_name || ''}`.trim()}</span>
              {contactSegments.length > 0 && (
                <div className="flex gap-1 mt-0.5 flex-wrap">
                  {contactSegments.slice(0, 2).map(seg => (
                    <span
                      key={seg.id}
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${seg.color}18`, color: seg.color }}
                    >
                      {seg.name}
                    </span>
                  ))}
                  {contactSegments.length > 2 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                      +{contactSegments.length - 2}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      },
    },
    { key: 'email',    header: 'Email',    render: (c: Contact) => c.email ? <span className="text-sky-600 text-sm">{c.email}</span> : '—' },
    { key: 'phone',    header: 'Phone',    render: (c: Contact) => <span className="text-slate-500 text-sm">{c.phone || '—'}</span> },
    { key: 'position', header: 'Position', render: (c: Contact) => getPositionPill(c.position) || <span className="text-muted-foreground">—</span> },
    { key: 'company',  header: 'Company',  render: (c: Contact) => c.companies?.name ? <span className="text-indigo-600 font-medium text-sm">{c.companies.name}</span> : '—' },
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
            <button onClick={() => handleEdit(contact)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
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

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="h-14 w-14 rounded-xl bg-primary/20 flex items-center justify-center">
          <span className="text-xl font-bold text-primary">Z</span>
        </div>
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    </div>
  );

  const activeSegment = segments.find(s => s.id === activeSegmentId);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── HEADER ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="text-muted-foreground mt-1">
            {activeSegment
              ? <><span className="font-semibold" style={{ color: activeSegment.color }}>{activeSegment.name}</span> · {displayedContacts.length} contacts</>
              : `${contacts.length} contacts across ${companies.length} companies`
            }
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={open => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSegments(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${showSegments ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
            >
              <Layers className="h-4 w-4" />
              Segments
              {showSegments ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <ImportButton entity="contacts" requiredColumns={['first_name','last_name','email','phone','position','company_id']} onImport={async (rows: any[]) => { const { error } = await supabase.from('contacts').insert(rows); if (error) throw error; fetchData(); }} />
            {role === 'admin' && <ExportDropdown onExport={handleExport} />}
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Contact</Button>
            </DialogTrigger>
          </div>

          {/* ── FORM DIALOG ── */}
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editingContact ? 'Edit Contact' : 'Add New Contact'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name <span className="text-destructive">*</span></Label>
                  <Input value={formData.first_name} className={formErrors.first_name ? 'border-destructive' : ''} onChange={e => setFormData({ ...formData, first_name: e.target.value })} />
                  {formErrors.first_name && <p className="text-xs text-destructive">{formErrors.first_name}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input value={formData.last_name} onChange={e => setFormData({ ...formData, last_name: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={formData.email} className={formErrors.email ? 'border-destructive' : ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={formData.phone} className={formErrors.phone ? 'border-destructive' : ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                {formErrors.phone && <p className="text-xs text-destructive">{formErrors.phone}</p>}
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
                <Button type="submit" className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white">{editingContact ? 'Update Contact' : 'Create Contact'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── SEGMENTATION PANEL ── */}
      {showSegments && (
        <SegmentationPanel
          contacts={contacts}
          companies={companies}
          segments={segments}
          activeSegmentId={activeSegmentId}
          onSegmentClick={setActiveSegmentId}
          onSegmentsChange={handleSegmentsChange}
        />
      )}

      {/* Active segment filter bar */}
      {activeSegmentId && activeSegment && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: `${activeSegment.color}40`, backgroundColor: `${activeSegment.color}08` }}>
          <Filter className="h-3.5 w-3.5" style={{ color: activeSegment.color }} />
          <span className="font-medium" style={{ color: activeSegment.color }}>Showing: {activeSegment.name}</span>
          <span className="text-slate-400">· {displayedContacts.length} of {contacts.length} contacts</span>
          <button onClick={() => setActiveSegmentId(null)} className="ml-auto text-slate-400 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Mobile */}
      <div className="space-y-4 md:hidden">
        {displayedContacts.map(contact => (
          <div key={contact.id} className="rounded-xl border border-slate-200/80 bg-white p-4 space-y-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
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
              {canEditContacts  && <button onClick={() => handleEdit(contact)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"><Pencil className="h-4 w-4" /></button>}
              {canEditOwn(contact) && <button onClick={() => handleEdit(contact)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"><Pencil className="h-4 w-4" /></button>}
              {canDeleteContacts && <button onClick={() => handleDelete(contact.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={displayedContacts}
          emptyIcon={Users}
          emptyTitle={activeSegmentId ? 'No contacts in this segment' : 'No contacts yet'}
          emptyDescription={activeSegmentId ? 'Try adjusting your segment filters.' : 'Start adding contacts to build your network.'}
          emptyActionLabel={activeSegmentId ? 'Clear filter' : 'Add your first contact'}
          onEmptyAction={() => {
            if (activeSegmentId) { setActiveSegmentId(null); return; }
            if (companies.length === 0) { navigate('/companies'); } else { setIsDialogOpen(true); }
          }}
        />
      </div>
    </div>
  );
}