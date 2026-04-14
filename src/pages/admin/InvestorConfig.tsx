/**
 * pages/admin/InvestorConfig.tsx
 *
 * Admin-only page to:
 * - Set a custom headline for the investor dashboard
 * - Post notices visible to ALL users (shown on the main Dashboard's notice board)
 *   or restrict them to investors only
 * - Delete / toggle visibility of notices
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirmDelete } from '@/hooks/useConfirmDelete';
import { PageLoader } from '@/components/PageLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Pin, Plus, Trash2, Eye, EyeOff, Globe, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { logAudit } from '@/lib/audit';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface NoticePost {
  id: string;
  title: string;
  body: string;
  tag: 'General' | 'Update' | 'Alert';
  pinned: boolean;
  visible_to_investors: boolean; // true = visible to ALL users on main dashboard
  created_at: string;
}

const tagColors: Record<string, string> = {
  General: 'bg-muted text-muted-foreground',
  Update:  'bg-blue-100 text-blue-700',
  Alert:   'bg-red-100 text-red-700',
};

/* ── Page ───────────────────────────────────────────────────────────────────── */

export default function InvestorConfig() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();

  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [notices,    setNotices]    = useState<NoticePost[]>([]);
  const [headline,   setHeadline]   = useState('');
  const [configId,   setConfigId]   = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [form, setForm] = useState({
    title: '',
    body: '',
    tag: 'General' as NoticePost['tag'],
    pinned: false,
    visible_to_investors: true, // true = visible on main dashboard for everyone
  });

  /* ── Access guard ── */
  useEffect(() => {
    if (profile && profile.role !== 'admin') {
      navigate('/dashboard', { replace: true });
    }
  }, [profile, navigate]);

  /* ── Fetch ── */
  const fetchAll = async () => {
    const [{ data: noticesData }, { data: configData }] = await Promise.all([
      (supabase as any)
        .from('notice_board')
        .select('*')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      (supabase as any)
        .from('investor_dashboard_config')
        .select('id, headline')
        .limit(1)
        .maybeSingle(),
    ]);

    setNotices((noticesData ?? []) as NoticePost[]);
    setHeadline(configData?.headline ?? '');
    setConfigId(configData?.id ?? null);
    setLoading(false);
  };

  useEffect(() => {
    if (!user || !profile) return;
    if (profile.role !== 'admin') return;
    fetchAll();
  }, [user, profile]);

  /* ── Save headline ── */
  const handleSaveHeadline = async () => {
    setSaving(true);
    if (configId) {
      await (supabase as any)
        .from('investor_dashboard_config')
        .update({ headline, updated_at: new Date().toISOString() })
        .eq('id', configId);
    } else {
      const { data } = await (supabase as any)
        .from('investor_dashboard_config')
        .insert({ headline, updated_at: new Date().toISOString() })
        .select('id')
        .single();
      if (data?.id) setConfigId(data.id);
    }
    logAudit({ userId: user?.id, userEmail: profile?.email, action: 'UPDATE', entity: 'investor_dashboard_config' });
    toast({ title: 'Headline saved' });
    setSaving(false);
  };

  /* ── Post notice ── */
  const handlePostNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await (supabase as any)
      .from('notice_board')
      .insert({
        title:                form.title,
        body:                 form.body,
        tag:                  form.tag,
        pinned:               form.pinned,
        visible_to_investors: form.visible_to_investors,
        created_by:           user?.id,
      });

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }
    logAudit({ userId: user?.id, userEmail: profile?.email, action: 'CREATE', entity: 'notice_board' });
    toast({ title: 'Notice posted', description: form.visible_to_investors ? 'Visible to all users.' : 'Hidden from dashboard.' });
    setDialogOpen(false);
    setForm({ title: '', body: '', tag: 'General', pinned: false, visible_to_investors: true });
    fetchAll();
  };

  /* ── Delete notice ── */
  const handleDelete = (notice: NoticePost) => {
    confirm({
      title: `Delete "${notice.title}"?`,
      description: 'This will remove it from all dashboards immediately.',
      onConfirm: async () => {
        await (supabase as any).from('notice_board').delete().eq('id', notice.id);
        logAudit({ userId: user?.id, userEmail: profile?.email, action: 'DELETE', entity: 'notice_board', entityId: notice.id });
        toast({ title: 'Notice deleted' });
        fetchAll();
      },
    });
  };

  /* ── Toggle visibility ── */
  const toggleVisibility = async (notice: NoticePost) => {
    await (supabase as any)
      .from('notice_board')
      .update({ visible_to_investors: !notice.visible_to_investors })
      .eq('id', notice.id);
    fetchAll();
  };

  if (loading || !profile) return <PageLoader />;

  /* ── Stats ── */
  const visibleCount = notices.filter(n => n.visible_to_investors).length;
  const pinnedCount  = notices.filter(n => n.pinned).length;

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Header ── */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notice Board & Investor Config</h1>
        <p className="text-muted-foreground mt-1">
          Post notices visible to all users or the investor dashboard. Set the investor welcome headline.
        </p>
      </div>

      {/* ── Quick stats ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{notices.length}</p>
          <p className="text-sm text-muted-foreground">Total notices</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{visibleCount}</p>
          <p className="text-sm text-muted-foreground">Visible to all</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">{pinnedCount}</p>
          <p className="text-sm text-muted-foreground">Pinned</p>
        </div>
      </div>

      {/* ── Investor headline ── */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Investor Dashboard Headline</h2>
          <p className="text-sm text-muted-foreground">
            Shown at the top of the investor dashboard as a subtitle.
          </p>
        </div>
        <div className="flex gap-3">
          <Input
            value={headline}
            onChange={e => setHeadline(e.target.value)}
            placeholder="e.g. Q2 2026 — Strong growth across all segments."
            className="flex-1"
          />
          <Button onClick={handleSaveHeadline} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* ── Notice Board ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Notice Board</h2>
            <p className="text-sm text-muted-foreground">
              Notices set to <strong>Visible to all</strong> appear on every user's dashboard.
              Notices set to <strong>Hidden</strong> are drafted but not shown anywhere.
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Post Notice
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>New Notice</DialogTitle>
              </DialogHeader>
              <form onSubmit={handlePostNotice} className="space-y-4">
                <div className="space-y-2">
                  <Label>Title <span className="text-destructive">*</span></Label>
                  <Input
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Body <span className="text-destructive">*</span></Label>
                  <Textarea
                    value={form.body}
                    onChange={e => setForm({ ...form, body: e.target.value })}
                    rows={4}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tag</Label>
                    <Select
                      value={form.tag}
                      onValueChange={v => setForm({ ...form, tag: v as NoticePost['tag'] })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="General">General</SelectItem>
                        <SelectItem value="Update">Update</SelectItem>
                        <SelectItem value="Alert">Alert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Audience</Label>
                    <Select
                      value={form.visible_to_investors ? 'all' : 'hidden'}
                      onValueChange={v => setForm({ ...form, visible_to_investors: v === 'all' })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          <span className="flex items-center gap-2">
                            <Globe className="h-3.5 w-3.5" /> Visible to all users
                          </span>
                        </SelectItem>
                        <SelectItem value="hidden">
                          <span className="flex items-center gap-2">
                            <Lock className="h-3.5 w-3.5" /> Hidden (draft)
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Pin this post?</Label>
                  <Select
                    value={form.pinned ? 'yes' : 'no'}
                    onValueChange={v => setForm({ ...form, pinned: v === 'yes' })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Pinned (shows at top)</SelectItem>
                      <SelectItem value="no">Not pinned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Preview chip */}
                <div className={`rounded-lg p-3 text-sm flex items-center gap-2
                  ${form.visible_to_investors
                    ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                    : 'bg-muted text-muted-foreground border border-border'
                  }`}>
                  {form.visible_to_investors
                    ? <><Globe className="h-4 w-4 shrink-0" /> This notice will appear on the Dashboard for <strong>all users</strong> including investors.</>
                    : <><Lock className="h-4 w-4 shrink-0" /> This notice will be saved as a draft and not shown anywhere.</>
                  }
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit">Post Notice</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Notice list */}
        {notices.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
            No notices yet. Post one to appear on all user dashboards.
          </div>
        ) : (
          <div className="space-y-3">
            {notices.map(notice => (
              <div
                key={notice.id}
                className={`bg-card border rounded-xl p-5
                  ${notice.pinned ? 'border-amber-300/50' : 'border-border'}
                  ${!notice.visible_to_investors ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {notice.pinned && <Pin className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                    <span className="font-semibold">{notice.title}</span>
                    <Badge className={tagColors[notice.tag] ?? tagColors.General}>{notice.tag}</Badge>
                    {notice.visible_to_investors
                      ? <Badge className="bg-green-100 text-green-700 flex items-center gap-1"><Globe className="h-3 w-3" />All users</Badge>
                      : <Badge className="bg-muted text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />Hidden</Badge>
                    }
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => toggleVisibility(notice)}
                      title={notice.visible_to_investors ? 'Hide from dashboards' : 'Show to all users'}
                    >
                      {notice.visible_to_investors
                        ? <Eye className="h-4 w-4 text-green-600" />
                        : <EyeOff className="h-4 w-4 text-muted-foreground" />
                      }
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(notice)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{notice.body}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {format(new Date(notice.created_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Preview links ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Preview investor view</p>
            <p className="text-xs text-muted-foreground">See what an investor sees.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/investor')}>
            Open
          </Button>
        </div>
        <div className="bg-muted/40 border border-border rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Preview main dashboard</p>
            <p className="text-xs text-muted-foreground">See notices as a regular user.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
            Open
          </Button>
        </div>
      </div>

      <ConfirmDeleteDialog />
    </div>
  );
}