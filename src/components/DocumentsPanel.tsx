/**
 * components/DocumentsPanel.tsx
 *
 * Reusable document attachment panel.
 * Drop inside any Projects/Deals/Tickets/Companies detail view.
 *
 * Usage:
 *   <DocumentsPanel entityType="project" entityId={project.id} />
 *   <DocumentsPanel entityType="deal"    entityId={deal.id} />
 *   <DocumentsPanel entityType="ticket"  entityId={ticket.id} />
 *   <DocumentsPanel entityType="company" entityId={company.id} />
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDelete } from '@/hooks/useConfirmDelete';
import {
  Upload, FileText, FileSpreadsheet, FileImage,
  File, Trash2, Download, Loader2, FolderOpen,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────────────────

export type DocumentEntityType = 'project' | 'deal' | 'ticket' | 'company';

interface DocumentRecord {
  id: string;
  name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  entity_type: DocumentEntityType;
  entity_id: string;
  uploaded_by: string | null;
  created_at: string;
  uploader_email?: string | null;
}

interface DocumentsPanelProps {
  entityType: DocumentEntityType;
  entityId: string;
  /** If false, only shows the list (no upload button) */
  canUpload?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(mime: string) {
  if (mime.startsWith('image/'))                return FileImage;
  if (mime.includes('pdf'))                     return FileText;
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return FileSpreadsheet;
  if (mime.includes('word') || mime.includes('document')) return FileText;
  return File;
}

function getFileColor(mime: string): string {
  if (mime.startsWith('image/'))   return 'text-pink-500 bg-pink-50';
  if (mime.includes('pdf'))        return 'text-red-500 bg-red-50';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv'))
    return 'text-emerald-600 bg-emerald-50';
  if (mime.includes('word') || mime.includes('document'))
    return 'text-blue-600 bg-blue-50';
  return 'text-slate-500 bg-slate-100';
}

// ── Component ──────────────────────────────────────────────────────────────────

export function DocumentsPanel({ entityType, entityId, canUpload = true }: DocumentsPanelProps) {
  const { user, profile, role } = useAuth();
  const { toast } = useToast();
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();

  const [docs,       setDocs]       = useState<DocumentRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const orgId    = (profile as any)?.organization_id as string | null;
  const canDelete = (doc: DocumentRecord) =>
    role === 'admin' || role === 'manager' || doc.uploaded_by === user?.id;

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('documents')
      .select('*, profiles!uploaded_by(email)')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ variant: 'destructive', title: 'Failed to load documents', description: error.message });
    } else {
      setDocs(
        ((data ?? []) as any[]).map((d: any) => ({
          ...d,
          uploader_email: d.profiles?.email ?? null,
        }))
      );
    }
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => { if (user) fetchDocs(); }, [user, fetchDocs]);

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !orgId || !user) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      // Sanitise filename
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${orgId}/${entityType}/${entityId}/${Date.now()}_${safeName}`;

      // Upload to storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (storageError) {
        toast({ variant: 'destructive', title: `Failed to upload "${file.name}"`, description: storageError.message });
        continue;
      }

      // Insert metadata record
      const { error: dbError } = await (supabase as any).from('documents').insert([{
        name:            file.name,
        file_path:       filePath,
        file_size:       file.size,
        mime_type:       file.type || 'application/octet-stream',
        entity_type:     entityType,
        entity_id:       entityId,
        organization_id: orgId,
        uploaded_by:     user.id,
      }]);

      if (dbError) {
        toast({ variant: 'destructive', title: 'Upload recorded but metadata failed', description: dbError.message });
      } else {
        toast({ title: `"${file.name}" uploaded` });
      }
    }

    setUploading(false);
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
    a.href     = data.signedUrl;
    a.download = doc.name;
    a.target   = '_blank';
    a.click();
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = (doc: DocumentRecord) => {
    confirm({
      title:       `Delete "${doc.name}"?`,
      description: 'This permanently removes the file. This cannot be undone.',
      onConfirm:   async () => {
        // Remove from storage
        await supabase.storage.from('documents').remove([doc.file_path]);
        // Remove metadata
        await (supabase as any).from('documents').delete().eq('id', doc.id);
        toast({ title: 'Document deleted' });
        fetchDocs();
      },
    });
  };

  // ── Drag & drop ─────────────────────────────────────────────────────────────

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragActive(true); };
  const onDragLeave = ()                     => setDragActive(false);
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleUpload(e.dataTransfer.files);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Upload zone */}
      {canUpload && (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
            cursor-pointer transition-all duration-150 py-6 px-4
            ${dragActive
              ? 'border-indigo-400 bg-indigo-50/60 scale-[1.01]'
              : 'border-slate-200 bg-slate-50/50 hover:border-indigo-300 hover:bg-indigo-50/30'}`}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
          ) : (
            <Upload className={`h-6 w-6 transition-colors ${dragActive ? 'text-indigo-500' : 'text-slate-300'}`} />
          )}
          <div className="text-center">
            <p className="text-sm font-medium text-slate-600">
              {uploading ? 'Uploading…' : dragActive ? 'Drop to upload' : 'Click or drag files here'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">PDF, Word, Excel, Images, ZIP · max 50 MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip"
            onChange={e => handleUpload(e.target.files)}
          />
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 text-indigo-400 animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
          <FolderOpen className="h-8 w-8 text-slate-200" />
          <p className="text-sm text-slate-400">No documents yet</p>
          {canUpload && <p className="text-xs text-slate-300">Upload files using the area above</p>}
        </div>
      ) : (
        <div className="space-y-1.5">
          {docs.map(doc => {
            const Icon  = getFileIcon(doc.mime_type);
            const color = getFileColor(doc.mime_type);
            return (
              <div
                key={doc.id}
                className="group flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5
                  hover:border-indigo-200 hover:shadow-sm transition-all"
              >
                {/* Icon */}
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 truncate">{doc.name}</p>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                    <span>{formatBytes(doc.file_size)}</span>
                    <span>·</span>
                    <span>{formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}</span>
                    {doc.uploader_email && (
                      <>
                        <span>·</span>
                        <span className="truncate max-w-[120px]">{doc.uploader_email}</span>
                      </>
                    )}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleDownload(doc)}
                    title="Download"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  {canDelete(doc) && (
                    <button
                      onClick={() => handleDelete(doc)}
                      title="Delete"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDeleteDialog />
    </div>
  );
}