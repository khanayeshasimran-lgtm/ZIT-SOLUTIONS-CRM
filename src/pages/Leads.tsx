import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirmDelete } from '@/hooks/useConfirmDelete';
import { logAudit } from '@/lib/audit';
import { PageLoader } from '@/components/PageLoader';
import { MobileCard } from '@/components/MobileCard';
import { PaginationControls } from '@/components/PaginationControls';
import { usePagination } from '@/hooks/usePagination';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/DataTable';
import { ExportDropdown } from '@/components/ExportDropdown';
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/export';
import { ImportButton } from '@/components/ImportButton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  UserPlus, Plus, Trash2, Pencil, ArrowRightCircle,
  Star, ClipboardList, Download, FileText, FileSpreadsheet,
  AlertTriangle, X, Flame, Thermometer, Snowflake, Mail,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { z } from 'zod';
import { getLastContactedDate } from '@/utils/activity';
import { EmailSuggestionPanel } from '@/components/ai/EmailSuggestionPanel';

// ── Service imports ───────────────────────────────────────────────────────────
import {
  fetchLeads, createLead, updateLead, deleteLead,
  updateLeadImportant, updateLeadStatus, updateLeadScore,
  computeLeadScore, scoreTier, SCORE_TIER_STYLES,
  applyLeadFilters,
  type Lead, type LeadFilters,
} from '@/services/leads.service';


// ── Zod validation schema ─────────────────────────────────────────────────────
const LeadFormSchema = z.object({
  name:   z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long').trim(),
  email:  z.string().email('Invalid email address').or(z.literal('')).optional(),
  phone:  z.string().min(6, 'Phone number too short').max(30, 'Phone too long').or(z.literal('')).optional(),
  source: z.string().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified']),
});
type LeadFormErrors = Partial<Record<keyof z.infer<typeof LeadFormSchema>, string>>;

// ── Types ─────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<Lead['status'], { label: string; pill: string; dot: string }> = {
  new:         { label: 'New',         pill: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',    dot: 'bg-indigo-400' },
  contacted:   { label: 'Contacted',   pill: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',            dot: 'bg-sky-400' },
  qualified:   { label: 'Qualified',   pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-400' },
  unqualified: { label: 'Unqualified', pill: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',     dot: 'bg-slate-400' },
};

const SOURCE_OPTIONS = [
  { value: 'website',    label: 'Website'    },
  { value: 'referral',   label: 'Referral'   },
  { value: 'linkedin',   label: 'LinkedIn'   },
  { value: 'cold_call',  label: 'Cold Call'  },
  { value: 'conference', label: 'Conference' },
];

const SCORE_ICONS = {
  hot:  Flame,
  warm: Thermometer,
  cold: Snowflake,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStaleness(lastContacted: Date) {
  const days = (Date.now() - lastContacted.getTime()) / 86_400_000;
  if (days <= 2)  return { label: 'Fresh', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' };
  if (days <= 7)  return { label: 'Warm',  className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' };
  if (days <= 14) return { label: 'Stale', className: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' };
  return { label: 'Cold', className: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' };
}

function getSLA(createdAt: string) {
  const diffMs   = Date.now() - new Date(createdAt).getTime();
  const totalHrs = Math.floor(diffMs / 3_600_000);
  const days     = Math.floor(totalHrs / 24);
  const hrs      = totalHrs % 24;
  return days > 0 ? `${days}d ${hrs}h` : `${hrs}h`;
}

const AVATAR_COLORS = [
  'from-indigo-400 to-indigo-600', 'from-sky-400 to-sky-600',
  'from-violet-400 to-violet-600', 'from-emerald-400 to-emerald-600',
  'from-amber-400 to-amber-600',   'from-pink-400 to-pink-600',
];

function LeadAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const color    = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div className={`h-7 w-7 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm`}>
      {initials}
    </div>
  );
}

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  const tier    = scoreTier(score);
  const style   = SCORE_TIER_STYLES[tier];
  const Icon    = SCORE_ICONS[tier];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${style.pill}`}>
      <Icon className="h-3 w-3" />
      {score !== null ? score : '—'}
    </span>
  );
}

// ── Duplicate warning dialog ──────────────────────────────────────────────────

interface DuplicateWarningProps {
  duplicates: Pick<Lead, 'id' | 'name' | 'email' | 'phone'>[];
  onContinue: () => void;
  onCancel: () => void;
}

function DuplicateWarningDialog({ duplicates, onContinue, onCancel }: DuplicateWarningProps) {
  return (
    <Dialog open onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Possible duplicate{duplicates.length > 1 ? 's' : ''} found
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The following lead{duplicates.length > 1 ? 's' : ''} already exist with a similar name, email, or phone:
        </p>
        <div className="space-y-2 my-2">
          {duplicates.map(d => (
            <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg bg-amber-50/60 border border-amber-200/60">
              <LeadAvatar name={d.name ?? ''} />
              <div>
                <p className="text-sm font-medium text-foreground">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[d.email, d.phone].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Do you want to create the lead anyway, or cancel and review the existing records?
        </p>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onCancel}>Cancel — review existing</Button>
          <Button
            className="bg-amber-500 hover:bg-amber-600 text-white"
            onClick={onContinue}
          >
            Create anyway
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Filter chips bar ──────────────────────────────────────────────────────────

interface FilterChipsProps {
  filters: LeadFilters;
  customSources: string[];
  onChange: (f: LeadFilters) => void;
  onClear: () => void;
}

function FilterChipsBar({ filters, customSources, onChange, onClear }: FilterChipsProps) {
  const allSources = [...SOURCE_OPTIONS.map(s => s.value), ...customSources];
  const hasActive  =
    (filters.status?.length ?? 0) > 0 ||
    (filters.source?.length ?? 0) > 0 ||
    filters.scoreTier !== undefined;

  const toggleStatus = (s: Lead['status']) => {
    const current = filters.status ?? [];
    const next    = current.includes(s) ? current.filter(x => x !== s) : [...current, s];
    onChange({ ...filters, status: next.length ? next : undefined });
  };

  const toggleSource = (s: string) => {
    const current = filters.source ?? [];
    const next    = current.includes(s) ? current.filter(x => x !== s) : [...current, s];
    onChange({ ...filters, source: next.length ? next : undefined });
  };

  const setScoreTier = (t: LeadFilters['scoreTier']) =>
    onChange({ ...filters, scoreTier: filters.scoreTier === t ? undefined : t });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">Status:</span>
        {(['new','contacted','qualified','unqualified'] as Lead['status'][]).map(s => {
          const cfg    = STATUS_CFG[s];
          const active = (filters.status ?? []).includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold
                transition-all ring-1
                ${active ? cfg.pill : 'bg-background text-muted-foreground ring-border hover:ring-input'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${active ? cfg.dot : 'bg-muted-foreground'}`} />
              {cfg.label}
            </button>
          );
        })}

        <span className="text-muted-foreground">·</span>

        <span className="text-xs font-medium text-muted-foreground">Score:</span>
        {(['hot','warm','cold'] as const).map(tier => {
          const style  = SCORE_TIER_STYLES[tier];
          const active = filters.scoreTier === tier;
          const Icon   = SCORE_ICONS[tier];
          return (
            <button
              key={tier}
              onClick={() => setScoreTier(tier)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold
                transition-all ring-1
                ${active ? style.pill : 'bg-background text-muted-foreground ring-border hover:ring-input'}`}
            >
              <Icon className="h-3 w-3" />
              {style.label}
            </button>
          );
        })}

        {hasActive && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-1"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">Source:</span>
        {allSources.map(s => {
          const active = (filters.source ?? []).includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleSource(s)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-all ring-1
                ${active
                  ? 'bg-slate-800 text-white ring-slate-700'
                  : 'bg-background text-muted-foreground ring-border hover:ring-input'}`}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', email: '', phone: '', source: '', status: 'new' as Lead['status'] };

export default function Leads() {
  const { user, role, profile } = useAuth();
  const navigate                = useNavigate();
  const { toast }               = useToast();
  const [searchParams]          = useSearchParams();
  const activeFilter            = searchParams.get('filter');
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();
  const { canManage, canExport, isUser } = usePermissions('leads');

  const [leads,         setLeads]         = useState<Lead[]>([]);
  const [customSources, setCustomSources] = useState<string[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [isDialogOpen,  setIsDialogOpen]  = useState(false);
  const [editingLead,   setEditingLead]   = useState<Lead | null>(null);
  const [showOtherSrc,  setShowOtherSrc]  = useState(false);
  const [formData,      setFormData]      = useState(EMPTY_FORM);
  const [submitting,    setSubmitting]    = useState(false);
  const [formErrors,    setFormErrors]    = useState<LeadFormErrors>({});

  // ── Lead detail sheet ────────────────────────────────────────────────────────
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Duplicate warning state
  const [pendingCreate, setPendingCreate]  = useState<typeof EMPTY_FORM | null>(null);
  const [duplicateHits, setDuplicateHits] = useState<Pick<Lead,'id'|'name'|'email'|'phone'>[]>([]);

  // Filter state
  const [searchText, setSearchText] = useState('');
  const [filters,    setFilters]    = useState<LeadFilters>({});

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const loadLeads = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchLeads();

      const now = new Date();
      const scored = data.map(l => {
        if (l.ai_score !== null) return l;
        const daysOld = (now.getTime() - new Date(l.created_at).getTime()) / 86_400_000;
        const score   = computeLeadScore({
          source:        l.source,
          emailPresent:  !!l.email,
          phonePresent:  !!l.phone,
          activityCount: Array.isArray(l.activities) ? l.activities.length : 0,
          daysOld:       Math.floor(daysOld),
          hasDeal:       (l.deals?.length ?? 0) > 0,
        });
        updateLeadScore(l.id, score).catch(() => {});
        return { ...l, ai_score: score };
      });

      setLeads(scored);

      const knownSources = new Set(SOURCE_OPTIONS.map(s => s.value));
      const custom = [...new Set(
        scored.map(l => l.source).filter((s): s is string => !!s && !knownSources.has(s))
      )];
      setCustomSources(custom);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to load leads', description: String(err) });
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // ── Filtering ───────────────────────────────────────────────────────────────

  const combinedFilters: LeadFilters = {
    ...filters,
    search:   searchText || undefined,
    idleOnly: activeFilter === 'idle' || undefined,
  };

  const filteredLeads = applyLeadFilters(leads, combinedFilters);
  const { paginatedData: pagedLeads, paginationProps } = usePagination(filteredLeads, 20);

  // ── Form helpers ────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormErrors({});
    setFormData(EMPTY_FORM);
    setEditingLead(null);
    setShowOtherSrc(false);
  };

  const handleSourceChange = (value: string) => {
    if (value === '__other__') { setShowOtherSrc(true); setFormData(f => ({ ...f, source: '' })); }
    else { setShowOtherSrc(false); setFormData(f => ({ ...f, source: value })); }
  };

  const doCreate = async (data: typeof EMPTY_FORM, force = false) => {
    if (!user) return;
    try {
      const result = await createLead({
        name:   data.name,
        email:  data.email,
        phone:  data.phone,
        source: data.source,
        status: 'new',
      }, force);

      if (result.type === 'duplicate') {
        setPendingCreate({ ...data });
        setDuplicateHits(result.duplicates);
        setIsDialogOpen(false);
        return;
      }

      logAudit({ userId: user.id, userEmail: user.email, action: 'CREATE', entity: 'leads' });
      toast({ title: 'Lead created' });
      setIsDialogOpen(false);
      resetForm();
      loadLeads();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const result = LeadFormSchema.safeParse(formData);
    if (!result.success) {
      const errs: LeadFormErrors = {};
      result.error.errors.forEach(e => {
        if (e.path[0]) errs[e.path[0] as keyof LeadFormErrors] = e.message;
      });
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    setSubmitting(true);

    try {
      if (editingLead) {
        await updateLead(editingLead.id, {
          name:   formData.name,
          email:  formData.email,
          phone:  formData.phone,
          source: formData.source,
          status: formData.status as Lead['status'],
        });
        logAudit({ userId: user.id, userEmail: user.email, action: 'UPDATE', entity: 'leads', entityId: editingLead.id });
        toast({ title: 'Lead updated' });
        setIsDialogOpen(false);
        resetForm();
        loadLeads();
        return;
      }

      await doCreate(formData);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDuplicateContinue = async () => {
    if (!pendingCreate) return;
    const data = pendingCreate;
    setPendingCreate(null);
    setDuplicateHits([]);
    await doCreate(data, true);
  };

  const handleDuplicateCancel = () => {
    setPendingCreate(null);
    setDuplicateHits([]);
    setIsDialogOpen(true);
  };

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleEdit = (lead: Lead) => {
    if (lead.deals?.length) return;
    setEditingLead(lead);
    setFormData({
      name:   lead.name,
      email:  lead.email  ?? '',
      phone:  lead.phone  ?? '',
      source: lead.source ?? '',
      status: lead.status,
    });
    setShowOtherSrc(!!lead.source && !SOURCE_OPTIONS.some(o => o.value === lead.source));
    setIsDialogOpen(true);
  };

  const handleDelete = (lead: Lead) => {
    confirm({
      title:       `Delete "${lead.name}"?`,
      description: 'This action cannot be undone.',
      onConfirm:   async () => {
        try {
          await deleteLead(lead.id);
          logAudit({ userId: user?.id, userEmail: user?.email, action: 'DELETE', entity: 'leads', entityId: lead.id });
          toast({ title: 'Lead deleted' });
          loadLeads();
        } catch (err: any) {
          toast({ variant: 'destructive', title: 'Delete failed', description: err.message });
        }
      },
    });
  };

  const handleConvert = async (lead: Lead) => {
    const { data: existing } = await (supabase as any)
      .from('deals').select('id').eq('lead_id', lead.id).maybeSingle();
    if (existing) { toast({ variant: 'destructive', title: 'Already converted' }); return; }
    navigate('/pipeline', { state: { lead: { id: lead.id, name: lead.name } } });
  };

  const toggleImportant = async (lead: Lead) => {
    if (role !== 'user') return;
    await updateLeadImportant(lead.id, !lead.is_important);
    loadLeads();
  };

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    if (!canExport) return;
    const rows = filteredLeads.map(l => ({
      Name:          l.name,
      Email:         l.email ?? '',
      Phone:         l.phone ?? '',
      Status:        l.status,
      Source:        l.source ?? '',
      Score:         l.ai_score ?? '',
      LastContacted: l.last_contacted_at
        ? new Date(l.last_contacted_at).toLocaleString('en-GB')
        : '',
      CreatedAt: new Date(l.created_at).toLocaleString('en-GB'),
    }));
    if (!rows.length) { toast({ variant: 'destructive', title: 'Nothing to export' }); return; }
    if (type === 'csv')   exportToCSV('leads', rows);
    if (type === 'excel') exportToExcel('leads', rows);
    if (type === 'pdf')   exportToPDF('leads', rows, {
      title: 'ZIT Solutions – CRM', subtitle: 'Leads Report', exportedBy: user?.email ?? 'System',
    });
    logAudit({ userId: user?.id, userEmail: user?.email, action: 'EXPORT', entity: 'leads', entityId: `${type.toUpperCase()} (${rows.length} rows)` });
  };

  // ── Table columns ─────────────────────────────────────────────────────────

  const allSources = [...SOURCE_OPTIONS, ...customSources.map(s => ({ value: s, label: s }))];

  const columns = [
    {
      key: 'name', header: 'Name',
      render: (l: Lead) => (
        <button
          onClick={() => setSelectedLead(l)}
          className="flex items-center gap-2.5 text-left group"
        >
          <LeadAvatar name={l.name} />
          <span className="font-medium text-slate-800 group-hover:text-indigo-600 transition-colors">
            {l.name}
          </span>
        </button>
      ),
    },
    {
      key: 'email', header: 'Email',
      render: (l: Lead) => l.email
        ? <span className="text-sky-600 text-sm">{l.email}</span>
        : '—',
    },
    {
      key: 'phone', header: 'Phone',
      render: (l: Lead) => <span className="text-slate-500 text-sm">{l.phone ?? '—'}</span>,
    },
    {
      key: 'score', header: 'Score', className: 'hidden md:table-cell',
      render: (l: Lead) => <ScoreBadge score={l.ai_score ?? null} />,
    },
    {
      key: 'source', header: 'Source', className: 'hidden md:table-cell',
      render: (l: Lead) => l.source
        ? <span className="text-xs text-slate-600 bg-slate-100 rounded-full px-2.5 py-0.5">{l.source}</span>
        : '—',
    },
    {
      key: 'health', header: 'Health', className: 'hidden md:table-cell',
      render: (l: Lead) => {
        const lastContacted = l.last_contacted_at
          ? new Date(l.last_contacted_at)
          : new Date(l.created_at);
        const staleness = getStaleness(lastContacted);
        const sla       = getSLA(l.created_at);
        return (
          <div className="flex justify-center">
            <div className="flex items-center h-7 rounded-full border overflow-hidden text-xs font-semibold whitespace-nowrap">
              <span className={`px-2 h-full flex items-center rounded-full ${staleness.className}`}>{staleness.label}</span>
              <span className="px-2 h-full flex items-center text-muted-foreground min-w-[42px] justify-center">{sla}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'status', header: 'Status', className: 'hidden md:table-cell',
      render: (l: Lead) => {
        const cfg = STATUS_CFG[l.status];
        return (
          <div className="flex justify-center">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.pill}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
            </span>
          </div>
        );
      },
    },
    {
      key: 'last_contacted', header: 'Last contacted', className: 'hidden md:table-cell',
      render: (l: Lead) => {
        const lastContacted = getLastContactedDate(l.activities ?? []) ?? new Date(l.created_at);
        return (
          <span className="text-xs text-muted-foreground" title={lastContacted.toLocaleString()}>
            {formatDistanceToNow(lastContacted, { addSuffix: true })}
          </span>
        );
      },
    },
    {
      key: 'actions', header: 'Actions', className: 'hidden md:table-cell',
      render: (l: Lead) => {
        const converted = !!l.deals?.length;
        const isOwn     = l.created_by === user?.id;
        return (
          <div className="flex items-center gap-1">
            {/* AI email shortcut */}
            <button
              onClick={() => setSelectedLead(l)}
              title="AI email suggestions"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-500 transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
            </button>
            {canManage && (
              <>
                <button disabled={converted} onClick={() => handleEdit(l)} title="Edit"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors disabled:opacity-30">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button disabled={converted} onClick={() => handleConvert(l)} title="Convert to deal"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors disabled:opacity-30">
                  <ArrowRightCircle className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => navigate('/activities', { state: { leadId: l.id } })} title="Add activity"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-violet-50 hover:text-violet-600 transition-colors">
                  <ClipboardList className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDelete(l)} title="Delete"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {isUser && isOwn && !converted && (
              <button onClick={() => handleEdit(l)} title="Edit"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {isUser && (
              <button onClick={() => toggleImportant(l)} title="Mark important"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-500 transition-colors">
                <Star className={`h-3.5 w-3.5 ${l.is_important ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  if (loading) return <PageLoader />;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Duplicate warning overlay */}
      {duplicateHits.length > 0 && pendingCreate && (
        <DuplicateWarningDialog
          duplicates={duplicateHits}
          onContinue={handleDuplicateContinue}
          onCancel={handleDuplicateCancel}
        />
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Leads
            {activeFilter === 'idle' && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">— idle filter active</span>
            )}
          </h1>
          <p className="text-muted-foreground">Manage your sales leads</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportButton
            entity="leads"
            requiredColumns={['name','email','phone','source','status']}
            onImport={async (rows: any[]) => {
              const { error } = await (supabase as any).from('leads').insert(rows);
              if (error) throw error;
              loadLeads();
            }}
          />
          {canExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline"><Download className="mr-2 h-4 w-4" />Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('csv')}>
                  <FileText className="mr-2 h-4 w-4" />CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('pdf')}>
                  <FileText className="mr-2 h-4 w-4" />PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Dialog open={isDialogOpen} onOpenChange={o => { setIsDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Add Lead</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingLead ? 'Edit Lead' : 'Add Lead'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    value={formData.name}
                    className={formErrors.name ? 'border-destructive' : ''}
                    onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  />
                  {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    className={formErrors.email ? 'border-destructive' : ''}
                    onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                  />
                  {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone}
                    className={formErrors.phone ? 'border-destructive' : ''}
                    onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                  />
                  {formErrors.phone && <p className="text-xs text-destructive">{formErrors.phone}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select value={formData.source} onValueChange={handleSourceChange}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      {allSources.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                      <SelectItem value="__other__">Other…</SelectItem>
                    </SelectContent>
                  </Select>
                  {showOtherSrc && (
                    <Input
                      className="mt-2"
                      placeholder="Enter custom source"
                      value={formData.source}
                      onChange={e => setFormData(f => ({ ...f, source: e.target.value }))}
                    />
                  )}
                </div>
                {editingLead && (
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={v => setFormData(f => ({ ...f, status: v as Lead['status'] }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="unqualified">Unqualified</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Checking…' : editingLead ? 'Save Changes' : 'Add Lead'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="space-y-3">
        <Input
          placeholder="Search by name, email, phone, source…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="max-w-sm"
        />
        <FilterChipsBar
          filters={filters}
          customSources={customSources}
          onChange={setFilters}
          onClear={() => setFilters({})}
        />
      </div>

      {/* Results count */}
      {(Object.keys(filters).length > 0 || searchText) && (
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{filteredLeads.length}</span> of{' '}
          <span className="font-medium text-foreground">{leads.length}</span> leads
        </p>
      )}

      {/* Desktop table */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={pagedLeads}
          emptyIcon={UserPlus}
          emptyTitle="No leads yet"
          emptyDescription="Start adding leads to grow your sales pipeline."
          emptyActionLabel="Add your first lead"
          onEmptyAction={() => setIsDialogOpen(true)}
        />
        <PaginationControls {...paginationProps} />
      </div>

      {/* Mobile cards */}
      <div className="space-y-4 md:hidden">
        {pagedLeads.map(l => {
          const cfg       = STATUS_CFG[l.status];
          const converted = !!l.deals?.length;
          const isOwn     = l.created_by === user?.id;
          return (
            <MobileCard
              key={l.id}
              title={
                <button
                  onClick={() => setSelectedLead(l)}
                  className="flex items-center gap-2 text-left"
                >
                  <LeadAvatar name={l.name} />{l.name}
                </button>
              }
              badge={
                <div className="flex gap-1">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.pill}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                  </span>
                  <ScoreBadge score={l.ai_score ?? null} />
                </div>
              }
              details={[
                { label: 'Email',  value: l.email  ?? '—' },
                { label: 'Phone',  value: l.phone  ?? '—' },
                { label: 'Source', value: l.source ?? '—' },
              ]}
              actions={
                <>
                  <button
                    onClick={() => setSelectedLead(l)}
                    title="AI email suggestions"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-500"
                  >
                    <Mail className="h-4 w-4" />
                  </button>
                  {canManage && !converted && (
                    <button onClick={() => handleEdit(l)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {canManage && (
                    <>
                      <button disabled={converted} onClick={() => handleConvert(l)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-30">
                        <ArrowRightCircle className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(l)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {isUser && isOwn && !converted && (
                    <button onClick={() => handleEdit(l)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {isUser && (
                    <button onClick={() => toggleImportant(l)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-500">
                      <Star className={`h-4 w-4 ${l.is_important ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                    </button>
                  )}
                </>
              }
            />
          );
        })}
        <PaginationControls {...paginationProps} />
      </div>

      <ConfirmDeleteDialog />

      {/* ── Lead detail sheet with AI email panel ── */}
      <Sheet open={!!selectedLead} onOpenChange={o => { if (!o) setSelectedLead(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto flex flex-col gap-0 p-0">
          {selectedLead && (
            <>
              {/* Sheet header */}
              <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 bg-white">
                <LeadAvatar name={selectedLead.name} />
                <div className="min-w-0">
                  <SheetTitle className="text-base font-bold text-slate-900 truncate">
                    {selectedLead.name}
                  </SheetTitle>
                  {selectedLead.email && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{selectedLead.email}</p>
                  )}
                </div>
                <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${STATUS_CFG[selectedLead.status].pill}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CFG[selectedLead.status].dot}`} />
                  {STATUS_CFG[selectedLead.status].label}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Lead details */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Phone',  value: selectedLead.phone  ?? '—' },
                    { label: 'Source', value: selectedLead.source ?? '—' },
                    { label: 'Score',  value: selectedLead.ai_score != null ? String(selectedLead.ai_score) : '—' },
                    {
                      label: 'Since',
                      value: formatDistanceToNow(
                        new Date(selectedLead.last_contacted_at ?? selectedLead.created_at),
                        { addSuffix: true }
                      ),
                    },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
                      <p className="text-sm font-medium text-slate-700 truncate">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Quick actions */}
                <div className="flex gap-2">
                  {canManage && !selectedLead.deals?.length && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => { setSelectedLead(null); handleEdit(selectedLead); }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                    </Button>
                  )}
                  {canManage && !selectedLead.deals?.length && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                      onClick={() => { setSelectedLead(null); handleConvert(selectedLead); }}
                    >
                      <ArrowRightCircle className="h-3.5 w-3.5 mr-1.5" />Convert
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => { setSelectedLead(null); navigate('/activities', { state: { leadId: selectedLead.id } }); }}
                  >
                    <ClipboardList className="h-3.5 w-3.5 mr-1.5" />Activity
                  </Button>
                </div>

                {/* ── AI Email Suggestions ── */}
                <EmailSuggestionPanel leadId={selectedLead.id} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}