/**
 * pages/admin/InvestorConfig.tsx — upgraded with advanced UI matching the CRM design language
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirmDelete } from '@/hooks/useConfirmDelete';
import { PageLoader } from '@/components/PageLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Pin, Plus, Trash2, Eye, EyeOff, Globe, Lock, TrendingUp, Bell, FileText } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { logAudit } from '@/lib/audit';

interface NoticePost {
  id: string; title: string; body: string;
  tag: 'General' | 'Update' | 'Alert';
  pinned: boolean; visible_to_investors: boolean; created_at: string;
}

const TAG_CFG: Record<string, { pill: string }> = {
  General: { pill: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
  Update:  { pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  Alert:   { pill: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
};

function StatCard({ label, value, icon: Icon, color, sub }: { label: string; value: number | string; icon: React.ElementType; color: string; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 flex items-center gap-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}><Icon className="h-5 w-5" /></div>
      <div><p className="text-2xl font-black tabular-nums text-slate-800">{value}</p><p className="text-xs text-muted-foreground">{label}</p>{sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}</div>
    </div>
  );
}

export default function InvestorConfig() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notices, setNotices] = useState<NoticePost[]>([]);
  const [headline, setHeadline] = useState('');
  const [configId, setConfigId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewText, setPreviewText] = useState('');

  const [form, setForm] = useState({
    title: '', body: '', tag: 'General' as NoticePost['tag'],
    pinned: false, visible_to_investors: true,
  });

  useEffect(() => {
    if (profile && profile.role !== 'admin') navigate('/dashboard', { replace: true });
  }, [profile, navigate]);

  const fetchAll = async () => {
    const [{ data: noticesData }, { data: configData }] = await Promise.all([
      (supabase as any).from('notice_board').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }),
      (supabase as any).from('investor_dashboard_config').select('id, headline').limit(1).maybeSingle(),
    ]);
    setNotices((noticesData ?? []) as NoticePost[]);
    setHeadline(configData?.headline ?? '');
    setConfigId(configData?.id ?? null);
    setLoading(false);
  };

  useEffect(() => { if (user && profile?.role === 'admin') fetchAll(); }, [user, profile]);

  const handleSaveHeadline = async () => {
    setSaving(true);
    if (configId) await (supabase as any).from('investor_dashboard_config').update({ headline, updated_at: new Date().toISOString() }).eq('id', configId);
    else { const { data } = await (supabase as any).from('investor_dashboard_config').insert({ headline, updated_at: new Date().toISOString() }).select('id').single(); if (data?.id) setConfigId(data.id); }
    logAudit({ userId: user?.id, userEmail: profile?.email, action: 'UPDATE', entity: 'investor_dashboard_config' });
    toast({ title: 'Headline saved' });
    setSaving(false);
  };

  const handlePostNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await (supabase as any).from('notice_board').insert({ title: form.title, body: form.body, tag: form.tag, pinned: form.pinned, visible_to_investors: form.visible_to_investors, created_by: user?.id });
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
    logAudit({ userId: user?.id, userEmail: profile?.email, action: 'CREATE', entity: 'notice_board' });
    toast({ title: 'Notice posted', description: form.visible_to_investors ? 'Visible to all users.' : 'Saved as draft.' });
    setDialogOpen(false);
    setForm({ title: '', body: '', tag: 'General', pinned: false, visible_to_investors: true });
    fetchAll();
  };

  const handleDelete = (notice: NoticePost) => {
    confirm({
      title: `Delete "${notice.title}"?`,
      description: 'Removes it from all dashboards immediately.',
      onConfirm: async () => {
        await (supabase as any).from('notice_board').delete().eq('id', notice.id);
        logAudit({ userId: user?.id, userEmail: profile?.email, action: 'DELETE', entity: 'notice_board', entityId: notice.id });
        toast({ title: 'Notice deleted' }); fetchAll();
      },
    });
  };

  const toggleVisibility = async (notice: NoticePost) => {
    await (supabase as any).from('notice_board').update({ visible_to_investors: !notice.visible_to_investors }).eq('id', notice.id);
    fetchAll();
  };

  if (loading || !profile) return <PageLoader />;

  const visibleCount = notices.filter(n => n.visible_to_investors).length;
  const pinnedCount  = notices.filter(n => n.pinned).length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Notice Board & Investor Config</h1>
          <p className="text-muted-foreground mt-1 text-sm">Post notices and configure the investor dashboard headline</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/investor')}>Preview investor view</Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>Preview dashboard</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total notices" value={notices.length}  icon={FileText}  color="bg-indigo-50 text-indigo-600" />
        <StatCard label="Visible to all" value={visibleCount}   icon={Globe}     color="bg-emerald-50 text-emerald-600" />
        <StatCard label="Pinned"         value={pinnedCount}    icon={Pin}       color="bg-amber-50 text-amber-600" />
      </div>

      {/* Investor headline */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_1px_4px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center"><TrendingUp className="h-4.5 w-4.5 text-indigo-600 h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold">Investor Dashboard Headline</h2>
            <p className="text-xs text-muted-foreground">Shown as subtitle on the investor dashboard</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Input value={headline} onChange={e => { setHeadline(e.target.value); setPreviewText(e.target.value); }} placeholder="e.g. Q2 2026 — Strong growth across all segments." className="flex-1" />
          <Button onClick={handleSaveHeadline} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
        {previewText && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600">
            <span className="text-xs text-muted-foreground font-medium mr-2">Preview:</span>
            {previewText}
          </div>
        )}
      </div>

      {/* Notice Board */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-lg">Notice Board</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="text-emerald-600 font-medium">Visible</span> notices appear on every user's dashboard.
              <span className="ml-1 text-slate-400">Hidden</span> = draft only.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700">
                <Plus className="h-4 w-4 mr-2" />Post Notice
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>New Notice</DialogTitle></DialogHeader>
              <form onSubmit={handlePostNotice} className="space-y-4">
                <div className="space-y-2"><Label>Title <span className="text-destructive">*</span></Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Body <span className="text-destructive">*</span></Label><Textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={4} required /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Tag</Label>
                    <Select value={form.tag} onValueChange={v => setForm({ ...form, tag: v as NoticePost['tag'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="General">General</SelectItem><SelectItem value="Update">Update</SelectItem><SelectItem value="Alert">Alert</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Audience</Label>
                    <Select value={form.visible_to_investors ? 'all' : 'hidden'} onValueChange={v => setForm({ ...form, visible_to_investors: v === 'all' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Visible to all</SelectItem><SelectItem value="hidden">Hidden (draft)</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Pin?</Label>
                    <Select value={form.pinned ? 'yes' : 'no'} onValueChange={v => setForm({ ...form, pinned: v === 'yes' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="yes">Pinned</SelectItem><SelectItem value="no">Not pinned</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Live preview chip */}
                <div className={`rounded-xl p-3 text-sm flex items-center gap-2 border ${form.visible_to_investors ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-muted text-muted-foreground border-border'}`}>
                  {form.visible_to_investors ? <><Globe className="h-4 w-4 shrink-0" />This notice will appear on every user's dashboard.</> : <><Lock className="h-4 w-4 shrink-0" />Saved as draft — not visible anywhere.</>}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit">Post Notice</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {notices.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center">
            <Bell className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No notices yet. Post one to appear on all user dashboards.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notices.map(notice => {
              const tagCfg = TAG_CFG[notice.tag] ?? TAG_CFG.General;
              return (
                <div key={notice.id}
                  className={`bg-white border rounded-2xl p-5 space-y-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.07)]
                    ${notice.pinned ? 'border-amber-200/80' : 'border-slate-200/80'}
                    ${!notice.visible_to_investors ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {notice.pinned && <Pin className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                      <span className="font-semibold text-slate-800">{notice.title}</span>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tagCfg.pill}`}>{notice.tag}</span>
                      {notice.visible_to_investors
                        ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"><Globe className="h-3 w-3" />All users</span>
                        : <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 ring-1 ring-slate-200"><Lock className="h-3 w-3" />Hidden</span>
                      }
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleVisibility(notice)} title={notice.visible_to_investors ? 'Hide' : 'Show to all'} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                        {notice.visible_to_investors ? <Eye className="h-4 w-4 text-emerald-500" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                      <button onClick={() => handleDelete(notice)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{notice.body}</p>
                  <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(notice.created_at), { addSuffix: true })} · {format(new Date(notice.created_at), 'MMM d, yyyy h:mm a')}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ConfirmDeleteDialog />
    </div>
  );
}