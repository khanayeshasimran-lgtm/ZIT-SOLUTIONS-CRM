import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { logAudit } from "@/lib/audit";
import { PageLoader } from "@/components/PageLoader";
import { MobileCard } from "@/components/MobileCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/ui/DataTable";
import { ExportDropdown } from "@/components/ExportDropdown";
import { exportToCSV, exportToExcel, exportToPDF } from "@/utils/export";
import { getLastContactedDate } from "@/utils/activity";
import { formatDistanceToNow } from "date-fns";
import { ImportButton } from "@/components/ImportButton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  UserPlus, Plus, Trash2, Pencil, ArrowRightCircle, Star, ClipboardList, Download, FileText, FileSpreadsheet,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: "new" | "contacted" | "qualified" | "unqualified";
  created_at: string;
  created_by?: string | null;
  last_contacted_at?: string | null;
  is_important?: boolean;
  deals?: { id: string }[];
  activities?: { type: string; created_at: string }[];
}

const STATUS_CFG: Record<Lead["status"], { label: string; pill: string; dot: string }> = {
  new:         { label: 'New',         pill: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',  dot: 'bg-indigo-400' },
  contacted:   { label: 'Contacted',   pill: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',          dot: 'bg-sky-400' },
  qualified:   { label: 'Qualified',   pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-400' },
  unqualified: { label: 'Unqualified', pill: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',   dot: 'bg-slate-400' },
};

const SOURCE_OPTIONS = [
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "cold_call", label: "Cold Call" },
  { value: "conference", label: "Conference" },
];

function getStaleness(lastContacted: Date) {
  const days = (Date.now() - lastContacted.getTime()) / 86_400_000;
  if (days <= 2)  return { label: "Fresh", className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" };
  if (days <= 7)  return { label: "Warm",  className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" };
  if (days <= 14) return { label: "Stale", className: "bg-orange-50 text-orange-700 ring-1 ring-orange-200" };
  return { label: "Cold", className: "bg-slate-100 text-slate-500 ring-1 ring-slate-200" };
}

function getSLA(createdAt: string) {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const totalHrs = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(totalHrs / 24);
  const hrs = totalHrs % 24;
  return days > 0 ? `${days}d ${hrs}h` : `${hrs}h`;
}

const AVATAR_COLORS = [
  'from-indigo-400 to-indigo-600', 'from-sky-400 to-sky-600',
  'from-violet-400 to-violet-600', 'from-emerald-400 to-emerald-600',
  'from-amber-400 to-amber-600', 'from-pink-400 to-pink-600',
];

function LeadAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div className={`h-7 w-7 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm`}>
      {initials}
    </div>
  );
}

export default function Leads() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const activeFilter = searchParams.get("filter");
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();

  const canManage = role === "admin" || role === "manager";
  const canAdd = role === "admin" || role === "manager" || role === "user";
  const canExport = role === "admin";

  const [leads, setLeads] = useState<Lead[]>([]);
  const [customSources, setCustomSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [showOtherSrc, setShowOtherSrc] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", source: "", status: "new" as Lead["status"] });

  const fetchLeads = async () => {
    if (!user) return;
    let query = supabase.from("leads").select(`*, deals:deals!left(id), activities:activities!left(type, created_at)`).order("created_at", { ascending: false });
    const { data, error } = await query;
    if (error) { toast({ variant: "destructive", title: "Error", description: error.message }); return; }
    setLeads(((data ?? []) as any[]).map(l => ({ ...l, activities: Array.isArray(l.activities) ? l.activities : [] })));
    const sources = (data ?? []).map(l => l.source).filter((s): s is string => !!s && !SOURCE_OPTIONS.some(o => o.value === s));
    setCustomSources([...new Set(sources)]);
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, [user]);

  const filteredLeads = activeFilter === "idle"
    ? leads.filter(l => { if (!l.last_contacted_at) return true; const threshold = new Date(); threshold.setDate(threshold.getDate() - 3); return new Date(l.last_contacted_at) < threshold; })
    : leads;

  const resetForm = () => { setFormData({ name: "", email: "", phone: "", source: "", status: "new" }); setEditingLead(null); setShowOtherSrc(false); };

  const handleSourceChange = (value: string) => {
    if (value === "__other__") { setShowOtherSrc(true); setFormData(f => ({ ...f, source: "" })); }
    else { setShowOtherSrc(false); setFormData(f => ({ ...f, source: value })); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const payload = { name: formData.name.trim(), email: formData.email.trim() || null, phone: formData.phone.trim() || null, source: formData.source || null, status: formData.status };
    let dupeQuery = supabase.from("leads").select("id");
    if (payload.email) dupeQuery = dupeQuery.or(`email.eq.${payload.email}`);
    if (payload.phone) dupeQuery = dupeQuery.or(`phone.eq.${payload.phone}`);
    if (editingLead) dupeQuery = (dupeQuery as any).neq("id", editingLead.id);
    if (payload.email || payload.phone) { const { data: dupe } = await dupeQuery.limit(1).maybeSingle(); if (dupe) { toast({ variant: "destructive", title: "Duplicate lead", description: "A lead with this email or phone already exists." }); return; } }
    const { error } = editingLead
      ? await supabase.from("leads").update(payload).eq("id", editingLead.id)
      : await supabase.from("leads").insert([{ ...payload, status: "new" }]);
    if (error) { toast({ variant: "destructive", title: "Error", description: error.message }); return; }
    toast({ title: editingLead ? "Lead updated" : "Lead created" });
    setIsDialogOpen(false); resetForm(); fetchLeads();
  };

  const handleEdit = (lead: Lead) => {
    if (lead.deals?.length) return;
    setEditingLead(lead);
    setFormData({ name: lead.name, email: lead.email ?? "", phone: lead.phone ?? "", source: lead.source ?? "", status: lead.status });
    setShowOtherSrc(!!lead.source && !SOURCE_OPTIONS.some(o => o.value === lead.source));
    setIsDialogOpen(true);
  };

  const handleDelete = (lead: Lead) => {
    confirm({
      title: `Delete "${lead.name}"?`,
      description: lead.deals?.length ? "This lead has activities linked. Delete them first." : "This action cannot be undone.",
      onConfirm: async () => {
        const { error } = await supabase.from("leads").delete().eq("id", lead.id);
        if (error) { toast({ variant: "destructive", title: "Delete failed", description: error.message }); return; }
        toast({ title: "Lead deleted" }); fetchLeads();
      },
    });
  };

  // ✅ FIX: removed premature status update — Pipeline.tsx handles it on actual deal save
  const handleConvert = async (lead: Lead) => {
    const { data: existing } = await supabase.from("deals").select("id").eq("lead_id", lead.id).maybeSingle();
    if (existing) { toast({ variant: "destructive", title: "Already converted" }); return; }
    navigate("/pipeline", { state: { lead: { id: lead.id, name: lead.name } } });
  };

  const toggleImportant = async (lead: Lead) => {
    if (role !== "user") return;
    await supabase.from("leads").update({ is_important: !lead.is_important } as any).eq("id", lead.id);
    fetchLeads();
  };

  const handleExport = (type: "csv" | "excel" | "pdf") => {
    if (!canExport) return;
    const rows = leads.map(l => ({ Name: l.name, Email: l.email ?? "", Phone: l.phone ?? "", Status: l.status, Source: l.source ?? "", LastContacted: l.last_contacted_at ? new Date(l.last_contacted_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "", CreatedAt: new Date(l.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) }));
    if (!rows.length) { toast({ variant: "destructive", title: "Nothing to export" }); return; }
    if (type === "csv") exportToCSV("leads", rows);
    if (type === "excel") exportToExcel("leads", rows);
    if (type === "pdf") exportToPDF("leads", rows, { title: "ZIT Solutions – CRM", subtitle: "Leads Report", exportedBy: user?.email ?? "System" });
    logAudit({ userId: user?.id, userEmail: user?.email, action: "EXPORT", entity: "leads", entityId: `${type.toUpperCase()} (${rows.length} rows)` });
  };

  const allSources = [...SOURCE_OPTIONS, ...customSources.map(s => ({ value: s, label: s }))];

  const columns = [
    {
      key: "name", header: "Name",
      render: (l: Lead) => (
        <div className="flex items-center gap-2.5">
          <LeadAvatar name={l.name} />
          <span className="font-medium text-slate-800">{l.name}</span>
        </div>
      ),
    },
    { key: "email", header: "Email", render: (l: Lead) => l.email ? <span className="text-sky-600 text-sm">{l.email}</span> : "—" },
    { key: "phone", header: "Phone", render: (l: Lead) => <span className="text-slate-500 text-sm">{l.phone ?? "—"}</span> },
    { key: "source", header: "Source", render: (l: Lead) => l.source ? <span className="text-xs text-slate-600 bg-slate-100 rounded-full px-2.5 py-0.5">{l.source}</span> : "—", className: "hidden md:table-cell" },
    {
      key: "health", header: "Lead health", className: "hidden md:table-cell",
      render: (l: Lead) => {
        const lastContacted = l.last_contacted_at ? new Date(l.last_contacted_at) : new Date(l.created_at);
        const staleness = getStaleness(lastContacted);
        const sla = getSLA(l.created_at);
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
      key: "status", header: "Status", className: "hidden md:table-cell",
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
      key: "last_contacted", header: "Last contacted", className: "hidden md:table-cell",
      render: (l: Lead) => {
        const lastContacted = getLastContactedDate(l.activities ?? []) ?? new Date(l.created_at);
        return <span className="text-xs text-muted-foreground" title={lastContacted.toLocaleString()}>{formatDistanceToNow(lastContacted, { addSuffix: true })}</span>;
      },
    },
    {
      key: "actions", header: "Actions", className: "hidden md:table-cell",
      render: (l: Lead) => {
        // ✅ FIX: converted is true only when a real deal is linked, not just status === "qualified"
        const converted = !!l.deals?.length;
        const isOwn = l.created_by === user?.id;
        return (
          <div className="flex items-center gap-1">
            {canManage && (
              <>
                <button disabled={converted} onClick={() => handleEdit(l)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors disabled:opacity-30" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                <button disabled={converted} onClick={() => handleConvert(l)} className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors disabled:opacity-30" title="Convert to deal"><ArrowRightCircle className="h-3.5 w-3.5" /></button>
                <button onClick={() => navigate("/activities", { state: { leadId: l.id } })} className="rounded-lg p-1.5 text-slate-400 hover:bg-violet-50 hover:text-violet-600 transition-colors" title="Add activity"><ClipboardList className="h-3.5 w-3.5" /></button>
                <button onClick={() => handleDelete(l)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
              </>
            )}
            {role === "user" && isOwn && !converted && (
              <button onClick={() => handleEdit(l)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
            )}
            {role === "user" && (
              <button onClick={() => toggleImportant(l)} className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-500 transition-colors" title="Mark important">
                <Star className={`h-3.5 w-3.5 ${l.is_important ? "fill-yellow-400 text-yellow-400" : ""}`} />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Leads
            {activeFilter === "idle" && <span className="ml-2 text-sm font-normal text-muted-foreground">— idle filter active</span>}
          </h1>
          <p className="text-muted-foreground">Manage your sales leads</p>
        </div>
        <div className="flex gap-2">
          <ImportButton entity="leads" requiredColumns={['name', 'email', 'phone', 'source', 'status']} onImport={async (rows: any[]) => { const { error } = await supabase.from('leads').insert(rows); if (error) throw error; fetchLeads(); }} />
          {canExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline"><Download className="mr-2 h-4 w-4" />Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("csv")}><FileText className="mr-2 h-4 w-4" />CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("excel")}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")}><FileText className="mr-2 h-4 w-4" />PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Dialog open={isDialogOpen} onOpenChange={o => { setIsDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>{editingLead ? "Edit Lead" : "Add Lead"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2"><Label>Name *</Label><Input required value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Phone</Label><Input value={formData.phone} onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))} /></div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select value={formData.source} onValueChange={handleSourceChange}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      {allSources.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      <SelectItem value="__other__">Other…</SelectItem>
                    </SelectContent>
                  </Select>
                  {showOtherSrc && <Input className="mt-2" placeholder="Enter custom source" value={formData.source} onChange={e => setFormData(f => ({ ...f, source: e.target.value }))} />}
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={v => setFormData(f => ({ ...f, status: v as Lead["status"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="unqualified">Unqualified</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit">{editingLead ? "Save Changes" : "Add Lead"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="hidden md:block">
        <DataTable columns={columns} data={filteredLeads} emptyIcon={UserPlus} emptyTitle="No leads yet" emptyDescription="Start adding leads to grow your sales pipeline." emptyActionLabel="Add your first lead" onEmptyAction={() => setIsDialogOpen(true)} />
      </div>

      <div className="space-y-4 md:hidden">
        {filteredLeads.map(l => {
          const cfg = STATUS_CFG[l.status];
          // ✅ FIX: same fix applied to mobile cards
          const converted = !!l.deals?.length;
          return (
            <MobileCard
              key={l.id}
              title={<span className="flex items-center gap-2"><LeadAvatar name={l.name} />{l.name}</span>}
              badge={<span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span>}
              details={[
                { label: "Email", value: l.email ?? "—" },
                { label: "Phone", value: l.phone ?? "—" },
                { label: "Source", value: l.source ?? "—" },
              ]}
              actions={
                <>
                  {canManage && !converted && <button onClick={() => handleEdit(l)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-4 w-4" /></button>}
                  {canManage && <button disabled={converted} onClick={() => handleConvert(l)} className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors disabled:opacity-30"><ArrowRightCircle className="h-4 w-4" /></button>}
                  {canManage && <button onClick={() => handleDelete(l)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>}
                  {role === "user" && l.created_by === user?.id && !converted && <button onClick={() => handleEdit(l)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-4 w-4" /></button>}
                  {role === "user" && <button onClick={() => toggleImportant(l)} className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-500 transition-colors"><Star className={`h-4 w-4 ${l.is_important ? "fill-yellow-400 text-yellow-400" : ""}`} /></button>}
                </>
              }
            />
          );
        })}
      </div>
      <ConfirmDeleteDialog />
    </div>
  );
}