/**
 * pages/Documents.tsx
 *
 * Global document management page.
 * - Shows all org documents across Projects, Deals, Tickets, Companies
 * - Search by name, filter by entity type
 * - Upload directly from this page (linked to an entity)
 * - Download, delete with permission checks
 * - Stats: total files, total size, by entity breakdown
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDelete } from '@/hooks/useConfirmDelete';
import { PageLoader } from '@/components/PageLoader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  FileText, FileSpreadsheet, FileImage, File,
  Upload, Download, Trash2, Search, FolderOpen,
  Loader2, FolderKanban, Handshake, Ticket, Building2,
  HardDrive, Filter,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────────────────

type EntityType = 'project' | 'deal' | 'ticket' | 'company';

interface DocumentRecord {
  id: string;
  name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  entity_type: EntityType;
  entity_id: string;
  organization_id: string;
  uploaded_by: string | null;
  created_at: string;
  uploader_email?: string | null;
  entity_name?: string | null;
}

interface EntityOption { id: string; name: string; }

// ── Config ─────────────────────────────────────────────────────────────────────

const ENTITY_CFG: Record<EntityType, {
  label: string; icon: React.ElementType;
  accent: string; light: string; pill: string;
}> = {
  project: { label: 'Project',  icon: FolderKanban, accent: '#14b8a6', light: '#f0fdfa', pill: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'        },
  deal:    { label: 'Deal',     icon: Handshake,    accent: '#10b981', light: '#ecfdf5', pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  ticket:  { label: 'Ticket',   icon: Ticket,       accent: '#e11d48', light: '#fff1f2', pill: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'          },
  company: { label: 'Company',  icon: Building2,    accent: '#f59e0b', light: '#fffbeb', pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'       },
};

// Sentinel value used instead of empty string for "no options" SelectItem
const EMPTY_SENTINEL = '__none__';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(mime: string) {
  if (mime.startsWith('image/'))                                                          return FileImage;
  if (mime.includes('pdf'))                                                               return FileText;
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv'))    return FileSpreadsheet;
  if (mime.includes('word') || mime.includes('document'))                                return FileText;
  return File;
}

function getFileColor(mime: string): string {
  if (mime.startsWith('image/'))  return 'text-pink-500 bg-pink-50';
  if (mime.includes('pdf'))       return 'text-red-500 bg-red-50';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv'))
    return 'text-emerald-600 bg-emerald-50';
  if (mime.includes('word') || mime.includes('document'))
    return 'text-blue-600 bg-blue-50';
  return 'text-slate-500 bg-slate-100';
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center gap-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-lg font-black tabular-nums text-slate-800">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Documents() {
  const { user, profile, role } = useAuth();
  const { toast }               = useToast();
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();

  const [docs,       setDocs]       = useState<DocumentRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState<EntityType | 'all'>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Entity options for upload dialog
  const [entityOptions,    setEntityOptions]    = useState<EntityOption[]>([]);
  const [loadingOptions,   setLoadingOptions]   = useState(false);
  const [uploadEntityType, setUploadEntityType] = useState<EntityType>('project');
  const [uploadEntityId,   setUploadEntityId]   = useState<string>('');
  const [pendingFiles,     setPendingFiles]      = useState<FileList | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const orgId        = (profile as any)?.organization_id as string | null;
  const canDeleteDoc = (doc: DocumentRecord) =>
    role === 'admin' || role === 'manager' || doc.uploaded_by === user?.id;

  // ── Fetch all org documents ────────────────────────────────────────────────

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('documents')
      .select('*, profiles!uploaded_by(email)')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ variant: 'destructive', title: 'Failed to load documents', description: error.message });
      setLoading(false);
      return;
    }

    const raw: DocumentRecord[] = ((data ?? []) as any[]).map((d: any) => ({
      ...d,
      uploader_email: d.profiles?.email ?? null,
      entity_name:    null,
    }));

    // Batch fetch entity names
    const projectIds = [...new Set(raw.filter(d => d.entity_type === 'project').map(d => d.entity_id))];
    const dealIds    = [...new Set(raw.filter(d => d.entity_type === 'deal').map(d => d.entity_id))];
    const ticketIds  = [...new Set(raw.filter(d => d.entity_type === 'ticket').map(d => d.entity_id))];
    const companyIds = [...new Set(raw.filter(d => d.entity_type === 'company').map(d => d.entity_id))];

    const [projectsRes, dealsRes, ticketsRes, companiesRes] = await Promise.all([
      projectIds.length ? (supabase as any).from('projects').select('id,name').in('id', projectIds)   : { data: [] },
      dealIds.length    ? (supabase as any).from('deals').select('id,title').in('id', dealIds)         : { data: [] },
      ticketIds.length  ? (supabase as any).from('tickets').select('id,title').in('id', ticketIds)    : { data: [] },
      companyIds.length ? (supabase as any).from('companies').select('id,name').in('id', companyIds)  : { data: [] },
    ]);

    const nameMap: Record<string, string> = {};
    (projectsRes.data ?? []).forEach((p: any) => { nameMap[p.id] = p.name; });
    (dealsRes.data    ?? []).forEach((d: any) => { nameMap[d.id] = d.title; });
    (ticketsRes.data  ?? []).forEach((t: any) => { nameMap[t.id] = t.title; });
    (companiesRes.data ?? []).forEach((c: any) => { nameMap[c.id] = c.name; });

    setDocs(raw.map(d => ({ ...d, entity_name: nameMap[d.entity_id] ?? null })));
    setLoading(false);
  }, []);

  useEffect(() => { if (user) fetchDocs(); }, [user, fetchDocs]);

  // ── Fetch entity options when upload type changes ──────────────────────────

  useEffect(() => {
    if (!uploadOpen) return;

    const fetchOptions = async () => {
      setLoadingOptions(true);
      setEntityOptions([]);
      setUploadEntityId(''); // reset while loading — don't bind stale id

      let data: EntityOption[] = [];
      if (uploadEntityType === 'project') {
        const r = await (supabase as any).from('projects').select('id,name').order('name');
        data = (r.data ?? []).map((p: any) => ({ id: p.id, name: p.name }));
      } else if (uploadEntityType === 'deal') {
        const r = await (supabase as any).from('deals').select('id,title').order('title');
        data = (r.data ?? []).map((d: any) => ({ id: d.id, name: d.title }));
      } else if (uploadEntityType === 'ticket') {
        const r = await (supabase as any).from('tickets').select('id,title').order('title');
        data = (r.data ?? []).map((t: any) => ({ id: t.id, name: t.title }));
      } else if (uploadEntityType === 'company') {
        const r = await (supabase as any).from('companies').select('id,name').order('name');
        data = (r.data ?? []).map((c: any) => ({ id: c.id, name: c.name }));
      }

      setEntityOptions(data);
      // FIX: only set a real id — never set an empty string
      setUploadEntityId(data[0]?.id ?? '');
      setLoadingOptions(false);
    };

    fetchOptions();
  }, [uploadEntityType, uploadOpen]);

  // ── Upload ─────────────────────────────────────────────────────────────────

  const doUpload = async (files: FileList) => {
    if (!orgId || !user || !uploadEntityId) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${orgId}/${uploadEntityType}/${uploadEntityId}/${Date.now()}_${safeName}`;

      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (storageError) {
        toast({ variant: 'destructive', title: `Failed: "${file.name}"`, description: storageError.message });
        continue;
      }

      const { error: dbError } = await (supabase as any).from('documents').insert([{
        name:            file.name,
        file_path:       filePath,
        file_size:       file.size,
        mime_type:       file.type || 'application/octet-stream',
        entity_type:     uploadEntityType,
        entity_id:       uploadEntityId,
        organization_id: orgId,
        uploaded_by:     user.id,
      }]);

      if (dbError) {
        toast({ variant: 'destructive', title: 'Metadata failed', description: dbError.message });
      } else {
        toast({ title: `"${file.name}" uploaded ✓` });
      }
    }

    setUploading(false);
    setUploadOpen(false);
    setPendingFiles(null);
    fetchDocs();
  };

  // ── Download ───────────────────────────────────────────────────────────────

  const handleDownload = async (doc: DocumentRecord) => {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.file_path, 60);

    if (error || !data?.signedUrl) {
      toast({ variant: 'destructive', title: 'Could not generate download link' });
      return;
    }
    const a = document.createElement('a');
    a.href = data.signedUrl; a.download = doc.name; a.target = '_blank'; a.click();
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = (doc: DocumentRecord) => {
    confirm({
      title: `Delete "${doc.name}"?`,
      description: 'Permanently removes the file. Cannot be undone.',
      onConfirm: async () => {
        await supabase.storage.from('documents').remove([doc.file_path]);
        await (supabase as any).from('documents').delete().eq('id', doc.id);
        toast({ title: 'Document deleted' });
        fetchDocs();
      },
    });
  };

  // ── Derived data ───────────────────────────────────────────────────────────

  const filtered = docs.filter(d => {
    const matchSearch = !search || d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.entity_name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || d.entity_type === typeFilter;
    return matchSearch && matchType;
  });

  const totalSize      = docs.reduce((s, d) => s + d.file_size, 0);
  const countByType    = (type: EntityType) => docs.filter(d => d.entity_type === type).length;

  // Whether the upload button should be enabled
  const canSubmitUpload = !!pendingFiles && !!uploadEntityId && !uploading && !loadingOptions;

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-teal-600" />
            Documents
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All files attached to projects, deals, tickets and companies
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />Upload Document
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total files"    value={String(docs.length)}               icon={File}         color="bg-slate-100 text-slate-600"  />
        <StatCard label="Storage used"   value={formatBytes(totalSize)}             icon={HardDrive}    color="bg-indigo-50 text-indigo-600"  />
        <StatCard label="Projects"       value={String(countByType('project'))}     icon={FolderKanban} color="bg-teal-50 text-teal-600"      />
        <StatCard label="Deals & others" value={String(docs.length - countByType('project'))} icon={Handshake} color="bg-emerald-50 text-emerald-600" />
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by file name or entity…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setTypeFilter('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ring-1
              ${typeFilter === 'all'
                ? 'bg-slate-800 text-white ring-slate-800 shadow-sm'
                : 'bg-background text-muted-foreground ring-border hover:ring-input'}`}
          >
            All ({docs.length})
          </button>
          {(Object.entries(ENTITY_CFG) as [EntityType, typeof ENTITY_CFG[EntityType]][]).map(([type, cfg]) => {
            const count  = countByType(type);
            const active = typeFilter === type;
            const Icon   = cfg.icon;
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(active ? 'all' : type)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ring-1
                  ${active ? cfg.pill + ' shadow-sm' : 'bg-background text-muted-foreground ring-border hover:ring-input'}`}
              >
                <Icon className="h-3 w-3" />
                {cfg.label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 text-[10px] font-bold
                    ${active ? 'bg-white/40' : 'bg-muted text-muted-foreground'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Document list ── */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-16 text-center">
          <FolderOpen className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="font-semibold text-slate-400">No documents found</p>
          <p className="text-sm text-slate-300 mt-1">
            {docs.length === 0 ? 'Upload your first document using the button above.' : 'Try adjusting your search or filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">File</th>
                <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Attached to</th>
                <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Uploaded by</th>
                <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Date</th>
                <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Size</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(doc => {
                const FileIcon   = getFileIcon(doc.mime_type);
                const fileColor  = getFileColor(doc.mime_type);
                const entityCfg  = ENTITY_CFG[doc.entity_type];
                const EntityIcon = entityCfg.icon;
                return (
                  <tr key={doc.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors group">
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${fileColor}`}>
                          <FileIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-slate-800 truncate max-w-[180px]">{doc.name}</p>
                          <p className="text-[10px] text-slate-400 uppercase">{doc.mime_type.split('/')[1] ?? doc.mime_type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${entityCfg.pill}`}>
                          <EntityIcon className="h-2.5 w-2.5" />
                          {entityCfg.label}
                        </span>
                        {doc.entity_name && (
                          <span className="text-xs text-slate-500 truncate max-w-[120px]">{doc.entity_name}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 hidden lg:table-cell">
                      <p className="text-xs text-slate-500 truncate max-w-[140px]">{doc.uploader_email ?? '—'}</p>
                    </td>
                    <td className="p-3 hidden sm:table-cell">
                      <p className="text-xs text-slate-500">{format(new Date(doc.created_at), 'MMM d, yyyy')}</p>
                      <p className="text-[10px] text-slate-400">{formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}</p>
                    </td>
                    <td className="p-3">
                      <span className="text-xs text-slate-500 tabular-nums">{formatBytes(doc.file_size)}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleDownload(doc)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        {canDeleteDoc(doc) && (
                          <button
                            onClick={() => handleDelete(doc)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Upload Dialog ── */}
      <Dialog
        open={uploadOpen}
        onOpenChange={o => {
          setUploadOpen(o);
          if (!o) {
            setPendingFiles(null);
            setEntityOptions([]);
            setUploadEntityId('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            {/* Entity type */}
            <div className="space-y-2">
              <Label>Attach to</Label>
              <Select
                value={uploadEntityType}
                onValueChange={v => setUploadEntityType(v as EntityType)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(ENTITY_CFG) as [EntityType, typeof ENTITY_CFG[EntityType]][]).map(([type, cfg]) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        <cfg.icon className="h-3.5 w-3.5" />
                        {cfg.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Entity selector — FIX: never use value="" on SelectItem */}
            <div className="space-y-2">
              <Label>Select {ENTITY_CFG[uploadEntityType].label}</Label>
              {loadingOptions ? (
                <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-input text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              ) : entityOptions.length === 0 ? (
                /* Show a disabled-looking input instead of an invalid SelectItem */
                <div className="flex items-center h-10 px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">
                  No {ENTITY_CFG[uploadEntityType].label.toLowerCase()}s found
                </div>
              ) : (
                <Select
                  value={uploadEntityId}
                  onValueChange={setUploadEntityId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Choose a ${ENTITY_CFG[uploadEntityType].label.toLowerCase()}…`} />
                  </SelectTrigger>
                  <SelectContent>
                    {entityOptions.map(opt => (
                      /* FIX: every SelectItem always has a real non-empty value */
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={e => { e.preventDefault(); setDragActive(false); setPendingFiles(e.dataTransfer.files); }}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
                cursor-pointer transition-all py-8 px-4
                ${dragActive ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200 bg-slate-50/50 hover:border-indigo-300'}`}
            >
              <Upload className={`h-7 w-7 transition-colors ${dragActive ? 'text-indigo-500' : 'text-slate-300'}`} />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-600">
                  {pendingFiles ? `${pendingFiles.length} file(s) ready` : 'Click or drag files here'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">PDF, Word, Excel, Images, ZIP · max 50 MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip"
                onChange={e => setPendingFiles(e.target.files)}
              />
            </div>

            {pendingFiles && (
              <div className="space-y-1">
                {Array.from(pendingFiles).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                    <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-slate-400 shrink-0">{formatBytes(f.size)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => { setUploadOpen(false); setPendingFiles(null); }}
              >
                Cancel
              </Button>
              <Button
                disabled={!canSubmitUpload}
                onClick={() => pendingFiles && doUpload(pendingFiles)}
              >
                {uploading
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Uploading…</>
                  : <><Upload className="h-4 w-4 mr-2" />Upload</>
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog />
    </div>
  );
}