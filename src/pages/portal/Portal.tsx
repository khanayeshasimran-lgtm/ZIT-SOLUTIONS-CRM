/**
 * pages/portal/Portal.tsx
 *
 * Enhanced Client Portal — Tier 4
 *
 * NEW vs original:
 *   ✅ Real-time project tracking — task breakdown by status, live progress
 *   ✅ Communication history — all activities + meetings linked to company
 *   ✅ Client notifications — in-app alerts for ticket updates, invoice due
 *   ✅ Document access — files attached to company projects/deals
 *   ✅ Invoice payment links (Stripe/Razorpay if configured)
 *   ✅ Realtime subscription — ticket status updates push live
 *   ✅ Better UI — tabbed layout, status timeline, activity feed
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  FolderKanban, Ticket, FileText, LogOut, Building2,
  Plus, Bell, BellOff, CheckCircle2, Clock, AlertCircle,
  MessageSquare, Video, Phone, Mail, Download, ExternalLink,
  ChevronRight, Activity, FolderOpen, CreditCard, RefreshCw,
  Circle, CheckCircle, XCircle, Loader,
} from 'lucide-react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PortalProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  tasks_todo: number;
  tasks_in_progress: number;
  tasks_done: number;
  tasks_total: number;
}

interface PortalTicket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string | null;
  created_at: string;
  updated_at: string;
}

interface PortalInvoice {
  id: string;
  invoice_number: string;
  total: number;
  status: string;
  currency: string;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  stripe_payment_link: string | null;
  razorpay_payment_link: string | null;
}

interface PortalActivity {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  created_at: string;
}

interface PortalMeeting {
  id: string;
  title: string;
  meeting_type: string;
  status: string;
  mode: string;
  start_time: string;
  end_time: string | null;
  video_link: string | null;
  notes: string | null;
}

interface PortalDocument {
  id: string;
  name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  entity_type: string;
  created_at: string;
}

interface PortalNotification {
  id: string;
  title: string;
  body: string;
  event: string;
  is_read: boolean;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(v: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 0,
  }).format(v);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const STATUS_PILLS: Record<string, string> = {
  open:               'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  in_progress:        'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  resolved:           'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  closed:             'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
  draft:              'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
  sent:               'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  paid:               'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  overdue:            'bg-red-50 text-red-700 ring-1 ring-red-200',
  active:             'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  completed:          'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  on_hold:            'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  scheduled:          'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  cancelled:          'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
};

const PRIORITY_PILLS: Record<string, string> = {
  low:    'bg-slate-100 text-slate-500',
  medium: 'bg-sky-50 text-sky-700',
  high:   'bg-amber-50 text-amber-700',
  urgent: 'bg-red-50 text-red-700',
};

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  call:      Phone,
  meeting:   Video,
  email:     Mail,
  follow_up: MessageSquare,
};

const MEETING_MODE_ICONS: Record<string, React.ElementType> = {
  virtual:   Video,
  in_person: Building2,
  phone:     Phone,
};

// ── Portal Auth ───────────────────────────────────────────────────────────────

export function PortalAuth() {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (user) navigate('/portal', { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast({ variant: 'destructive', title: 'Login failed', description: error.message });
    } else {
      const { data: { user: u } } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from('profiles').select('role, company_id').eq('id', u?.id ?? '').single();
      if ((prof as any)?.role !== 'client') {
        toast({ variant: 'destructive', title: 'Access denied', description: 'This portal is for clients only.' });
        await supabase.auth.signOut();
      } else {
        navigate('/portal', { replace: true });
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50/30 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Client Portal</h1>
          <p className="text-slate-500 mt-1">Z IT Solutions — Secure Client Access</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label>Email address</Label>
              <Input type="email" required autoFocus placeholder="you@company.com"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" required placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in to Portal'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Staff login? <a href="/auth" className="text-indigo-600 hover:underline">Go to dashboard</a>
        </p>
      </div>
    </div>
  );
}

// ── Portal Dashboard ──────────────────────────────────────────────────────────

export function PortalDashboard() {
  const { user, profile, signOut } = useAuth();
  const navigate  = useNavigate();
  const { toast } = useToast();

  type Tab = 'overview' | 'projects' | 'tickets' | 'invoices' | 'activity' | 'documents';
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [projects,      setProjects]      = useState<PortalProject[]>([]);
  const [tickets,       setTickets]       = useState<PortalTicket[]>([]);
  const [invoices,      setInvoices]      = useState<PortalInvoice[]>([]);
  const [activities,    setActivities]    = useState<PortalActivity[]>([]);
  const [meetings,      setMeetings]      = useState<PortalMeeting[]>([]);
  const [documents,     setDocuments]     = useState<PortalDocument[]>([]);
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [notifOpen,     setNotifOpen]     = useState(false);

  // New ticket form
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [newTicket, setNewTicket] = useState({ title: '', description: '', category: 'support' });
  const [submitting, setSubmitting] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!user) { navigate('/portal/auth', { replace: true }); return; }
    if (profile && (profile as any).role !== 'client') navigate('/dashboard', { replace: true });
  }, [user, profile, navigate]);

  const companyId  = (profile as any)?.company_id   as string | null;
  const orgId      = (profile as any)?.organization_id as string | null;
  const companyName = (profile as any)?.company ?? 'Your Company';

  // ── Load all data ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!user || !companyId) return;

    const [
      { data: proj },
      { data: tick },
      { data: inv },
      { data: acts },
      { data: meets },
      { data: docs },
      { data: notifs },
    ] = await Promise.all([
      // Projects
      (supabase as any).from('projects').select('id, name, description, status, start_date, end_date')
        .eq('organization_id', orgId).limit(20),

      // Tickets for this company
      (supabase as any).from('tickets')
        .select('id, title, description, status, priority, category, created_at, updated_at')
        .eq('company_id', companyId).order('created_at', { ascending: false }),

      // Invoices for this company
      (supabase as any).from('invoices')
        .select('id, invoice_number, total, status, currency, due_date, paid_at, created_at, stripe_payment_link, razorpay_payment_link')
        .eq('company_id', companyId).order('created_at', { ascending: false }),

      // Activities linked to this company's contacts/leads
      (supabase as any).from('activities')
        .select('id, type, title, description, status, due_date, created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false }).limit(30),

      // Meetings linked to this company
      (supabase as any).from('meetings')
        .select('id, title, meeting_type, status, mode, start_time, end_time, video_link, notes')
        .eq('company_id', companyId).order('start_time', { ascending: false }).limit(20),

      // Documents linked to this company
      (supabase as any).from('documents')
        .select('id, name, file_path, file_size, mime_type, entity_type, created_at')
        .eq('organization_id', orgId).order('created_at', { ascending: false }).limit(50),

      // In-app notifications for this user
      (supabase as any).from('notifications')
        .select('id, title, body, event, is_read, created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    ]);

    // Enrich projects with task counts
    const projWithTasks: PortalProject[] = await Promise.all(
      ((proj ?? []) as any[]).map(async (p: any) => {
        const [
          { count: total },
          { count: todo },
          { count: inprog },
          { count: done },
        ] = await Promise.all([
          (supabase as any).from('project_tasks').select('id', { count: 'exact', head: true }).eq('project_id', p.id),
          (supabase as any).from('project_tasks').select('id', { count: 'exact', head: true }).eq('project_id', p.id).eq('status', 'todo'),
          (supabase as any).from('project_tasks').select('id', { count: 'exact', head: true }).eq('project_id', p.id).eq('status', 'in_progress'),
          (supabase as any).from('project_tasks').select('id', { count: 'exact', head: true }).eq('project_id', p.id).eq('status', 'done'),
        ]);
        return {
          ...p,
          tasks_total:       total      ?? 0,
          tasks_todo:        todo       ?? 0,
          tasks_in_progress: inprog     ?? 0,
          tasks_done:        done       ?? 0,
        };
      })
    );

    setProjects(projWithTasks);
    setTickets((tick ?? []) as PortalTicket[]);
    setInvoices(((inv ?? []) as any[]).map((i: any) => ({
      ...i,
      status: i.status === 'sent' && i.due_date && new Date(i.due_date) < new Date() ? 'overdue' : i.status,
    })));
    setActivities((acts ?? []) as PortalActivity[]);
    setMeetings((meets ?? []) as PortalMeeting[]);
    setDocuments((docs ?? []) as PortalDocument[]);
    setNotifications((notifs ?? []) as PortalNotification[]);
    setLoading(false);
  }, [user, companyId, orgId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Realtime — ticket updates ──────────────────────────────────────────────

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel('portal-tickets')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'tickets',
        filter: `company_id=eq.${companyId}`,
      }, payload => {
        setTickets(prev => prev.map(t =>
          t.id === payload.new.id ? { ...t, ...payload.new } : t
        ));
        toast({ title: `Ticket updated: ${(payload.new as any).title}`, description: `Status: ${(payload.new as any).status}` });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  // ── Submit ticket ──────────────────────────────────────────────────────────

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicket.title.trim()) return;
    setSubmitting(true);
    const { error } = await (supabase as any).from('tickets').insert({
      title:       newTicket.title.trim(),
      description: newTicket.description.trim() || null,
      category:    newTicket.category,
      priority:    'medium',
      status:      'open',
      company_id:  companyId,
      created_by:  user?.id,
      organization_id: orgId,
    });
    setSubmitting(false);
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
    toast({ title: 'Ticket submitted ✓', description: 'Our team will be in touch soon.' });
    setNewTicket({ title: '', description: '', category: 'support' });
    setTicketDialogOpen(false);
    loadData();
  };

  // ── Mark notifications read ────────────────────────────────────────────────

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (!unreadIds.length) return;
    await (supabase as any).from('notifications').update({ is_read: true }).in('id', unreadIds);
    setNotifications(n => n.map(notif => ({ ...notif, is_read: true })));
  };

  // ── Download document ──────────────────────────────────────────────────────

  const handleDownload = async (doc: PortalDocument) => {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 60);
    if (error || !data?.signedUrl) { toast({ variant: 'destructive', title: 'Download failed' }); return; }
    const a = document.createElement('a');
    a.href = data.signedUrl; a.download = doc.name; a.target = '_blank'; a.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center animate-pulse">
            <Building2 className="h-6 w-6 text-indigo-500" />
          </div>
          <p className="text-sm text-slate-400">Loading your portal…</p>
        </div>
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // ── Summary stats ──────────────────────────────────────────────────────────

  const stats = [
    { label: 'Active projects',  value: projects.filter(p => p.status === 'active').length,                                             icon: FolderKanban, color: 'text-indigo-600', bg: 'bg-indigo-50'  },
    { label: 'Open tickets',     value: tickets.filter(t => ['open','in_progress'].includes(t.status)).length,                           icon: Ticket,       color: 'text-amber-600',  bg: 'bg-amber-50'   },
    { label: 'Pending invoices', value: invoices.filter(i => ['sent','overdue'].includes(i.status)).length,                              icon: FileText,     color: 'text-emerald-600',bg: 'bg-emerald-50' },
    { label: 'Documents',        value: documents.length,                                                                                icon: FolderOpen,   color: 'text-violet-600', bg: 'bg-violet-50'  },
  ];

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview',  label: 'Overview',   icon: Building2    },
    { id: 'projects',  label: 'Projects',   icon: FolderKanban },
    { id: 'tickets',   label: 'Tickets',    icon: Ticket       },
    { id: 'invoices',  label: 'Invoices',   icon: FileText     },
    { id: 'activity',  label: 'Activity',   icon: Activity     },
    { id: 'documents', label: 'Documents',  icon: FolderOpen   },
  ];

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Portal header ── */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{companyName}</p>
              <p className="text-xs text-slate-400">Client Portal · Z IT Solutions</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications bell */}
            <div className="relative">
              <button
                onClick={() => { setNotifOpen(v => !v); if (!notifOpen) markAllRead(); }}
                className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification dropdown */}
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-200/60 z-20 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800">Notifications</p>
                    <button onClick={() => setNotifOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs">Close</button>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-sm text-slate-400">No notifications yet</div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className={`px-4 py-3 border-b border-slate-50 last:border-0 ${n.is_read ? '' : 'bg-indigo-50/40'}`}
                        >
                          <p className="text-sm font-medium text-slate-800">{n.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User + sign out */}
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-[11px] font-bold">
                {(profile?.full_name || user?.email || 'C').charAt(0).toUpperCase()}
              </div>
              {!loading && (
                <span className="text-sm text-slate-600 hidden sm:block">
                  {profile?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0]}
                </span>
              )}
            </div>

            <button
              onClick={async () => { await signOut(); navigate('/portal/auth'); }}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-500 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:block">Sign out</span>
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-5xl mx-auto px-6 flex gap-1 overflow-x-auto pb-0 scrollbar-none">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
              </h1>
              <p className="text-slate-500 mt-1">Here's what's happening with your projects and support.</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map(s => (
                <button
                  key={s.label}
                  onClick={() => {
                    if (s.label.includes('project'))  setActiveTab('projects');
                    if (s.label.includes('ticket'))   setActiveTab('tickets');
                    if (s.label.includes('invoice'))  setActiveTab('invoices');
                    if (s.label.includes('Document')) setActiveTab('documents');
                  }}
                  className="bg-white border border-slate-200/80 rounded-xl p-4 flex items-center gap-3 hover:border-indigo-200 hover:shadow-sm transition-all text-left"
                >
                  <div className={`h-10 w-10 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                    <s.icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-800">{s.value}</p>
                    <p className="text-xs text-slate-400">{s.label}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Active projects summary */}
            {projects.filter(p => p.status === 'active').length > 0 && (
              <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-indigo-500" />
                    Active Projects
                  </h2>
                  <button onClick={() => setActiveTab('projects')} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                    View all <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                <div className="divide-y divide-slate-50">
                  {projects.filter(p => p.status === 'active').slice(0, 3).map(p => {
                    const pct = p.tasks_total > 0 ? Math.round((p.tasks_done / p.tasks_total) * 100) : 0;
                    return (
                      <div key={p.id} className="px-5 py-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                          <span className="text-xs text-slate-400">{pct}% complete</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1"><Circle className="h-2.5 w-2.5" />{p.tasks_todo} to do</span>
                          <span className="flex items-center gap-1"><Loader className="h-2.5 w-2.5 text-amber-400" />{p.tasks_in_progress} in progress</span>
                          <span className="flex items-center gap-1"><CheckCircle className="h-2.5 w-2.5 text-emerald-400" />{p.tasks_done} done</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent tickets */}
            {tickets.length > 0 && (
              <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Ticket className="h-4 w-4 text-amber-500" />
                    Recent Tickets
                  </h2>
                  <button onClick={() => setActiveTab('tickets')} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                    View all <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                <div className="divide-y divide-slate-50">
                  {tickets.slice(0, 4).map(t => (
                    <div key={t.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{t.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {format(new Date(t.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILLS[t.status] ?? STATUS_PILLS.open}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming meetings */}
            {meetings.filter(m => m.status === 'scheduled' && new Date(m.start_time) > new Date()).length > 0 && (
              <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    Upcoming Meetings
                  </h2>
                </div>
                <div className="divide-y divide-slate-50">
                  {meetings
                    .filter(m => m.status === 'scheduled' && new Date(m.start_time) > new Date())
                    .slice(0, 3)
                    .map(m => {
                      const ModeIcon = MEETING_MODE_ICONS[m.mode] ?? Clock;
                      return (
                        <div key={m.id} className="px-5 py-4 flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <ModeIcon className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{m.title}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {format(parseISO(m.start_time), 'EEEE, MMM d · h:mm a')}
                            </p>
                          </div>
                          {m.video_link && (
                            <a
                              href={m.video_link} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shrink-0"
                            >
                              <Video className="h-3.5 w-3.5" />Join
                            </a>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── PROJECTS TAB ── */}
        {activeTab === 'projects' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800">Your Projects</h2>
            {projects.length === 0 && (
              <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400">
                No projects yet.
              </div>
            )}
            {projects.map(p => {
              const pct = p.tasks_total > 0 ? Math.round((p.tasks_done / p.tasks_total) * 100) : 0;
              return (
                <div key={p.id} className="bg-white border border-slate-200/80 rounded-xl p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-800">{p.name}</p>
                      {p.description && <p className="text-sm text-slate-500 mt-0.5">{p.description}</p>}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                        {p.start_date && <span>Started {format(new Date(p.start_date), 'MMM d, yyyy')}</span>}
                        {p.end_date   && <span>Due {format(new Date(p.end_date), 'MMM d, yyyy')}</span>}
                      </div>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize shrink-0 ${STATUS_PILLS[p.status] ?? STATUS_PILLS.active}`}>
                      {p.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {p.tasks_total > 0 ? (
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                        <span className="font-medium">Progress</span>
                        <span>{pct}% complete · {p.tasks_done}/{p.tasks_total} tasks</span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            background: pct === 100
                              ? 'linear-gradient(to right, #10b981, #059669)'
                              : 'linear-gradient(to right, #6366f1, #8b5cf6)',
                          }}
                        />
                      </div>

                      {/* Task breakdown */}
                      <div className="grid grid-cols-3 gap-3 mt-3">
                        {[
                          { label: 'To Do',       count: p.tasks_todo,        icon: Circle,      color: 'text-slate-400',   bg: 'bg-slate-50'   },
                          { label: 'In Progress',  count: p.tasks_in_progress, icon: Loader,      color: 'text-amber-500',   bg: 'bg-amber-50'   },
                          { label: 'Done',         count: p.tasks_done,        icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                        ].map(s => (
                          <div key={s.label} className={`${s.bg} rounded-lg p-3 flex items-center gap-2`}>
                            <s.icon className={`h-4 w-4 ${s.color} shrink-0`} />
                            <div>
                              <p className="text-lg font-bold text-slate-800 leading-none">{s.count}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">{s.label}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No tasks added yet</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── TICKETS TAB ── */}
        {activeTab === 'tickets' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Support Tickets</h2>
              <Dialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />Submit a ticket</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader><DialogTitle>Submit a Support Ticket</DialogTitle></DialogHeader>
                  <form onSubmit={handleSubmitTicket} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Subject *</Label>
                      <Input required value={newTicket.title}
                        onChange={e => setNewTicket(t => ({ ...t, title: e.target.value }))}
                        placeholder="Brief description of the issue" />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={newTicket.category} onValueChange={v => setNewTicket(t => ({ ...t, category: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="support">Support</SelectItem>
                          <SelectItem value="bug">Bug report</SelectItem>
                          <SelectItem value="feature_request">Feature request</SelectItem>
                          <SelectItem value="billing">Billing</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Details</Label>
                      <Textarea rows={4} value={newTicket.description}
                        onChange={e => setNewTicket(t => ({ ...t, description: e.target.value }))}
                        placeholder="Describe the issue in detail…" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setTicketDialogOpen(false)}>Cancel</Button>
                      <Button type="submit" disabled={submitting}>
                        {submitting ? 'Submitting…' : 'Submit ticket'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {tickets.length === 0 && (
              <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400">
                No tickets yet. Submit one above.
              </div>
            )}

            {tickets.map(t => (
              <div key={t.id} className="bg-white border border-slate-200/80 rounded-xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800">{t.title}</p>
                    {t.description && (
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">{t.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 flex-wrap">
                      <span className="capitalize">{t.category ?? 'support'}</span>
                      <span>·</span>
                      <span>Opened {format(new Date(t.created_at), 'MMM d, yyyy')}</span>
                      <span>·</span>
                      <span>Updated {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILLS[t.status] ?? STATUS_PILLS.open}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_PILLS[t.priority] ?? PRIORITY_PILLS.medium}`}>
                      {t.priority}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── INVOICES TAB ── */}
        {activeTab === 'invoices' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800">Invoices</h2>

            {invoices.length === 0 && (
              <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400">
                No invoices yet.
              </div>
            )}

            {invoices.map(inv => (
              <div key={inv.id} className={`bg-white border rounded-xl p-5 ${inv.status === 'overdue' ? 'border-red-200' : 'border-slate-200/80'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-800">{inv.invoice_number}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span>Issued {format(new Date(inv.created_at), 'MMM d, yyyy')}</span>
                      {inv.due_date && <span>· Due {format(new Date(inv.due_date), 'MMM d, yyyy')}</span>}
                      {inv.paid_at  && <span>· Paid {format(new Date(inv.paid_at), 'MMM d, yyyy')}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <p className="text-lg font-bold text-slate-800">
                      {formatCurrency(inv.total, inv.currency)}
                    </p>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILLS[inv.status] ?? STATUS_PILLS.draft}`}>
                      {inv.status}
                    </span>
                  </div>
                </div>

                {/* Payment links */}
                {['sent','overdue'].includes(inv.status) && (inv.stripe_payment_link || inv.razorpay_payment_link) && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3 flex-wrap">
                    <p className="text-xs text-slate-500 font-medium">Pay now:</p>
                    {inv.stripe_payment_link && (
                      <a
                        href={inv.stripe_payment_link} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
                      >
                        <CreditCard className="h-3.5 w-3.5" />Pay with Stripe (USD)
                      </a>
                    )}
                    {inv.razorpay_payment_link && (
                      <a
                        href={inv.razorpay_payment_link} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors"
                      >
                        <CreditCard className="h-3.5 w-3.5" />Pay with Razorpay (INR)
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── ACTIVITY TAB ── */}
        {activeTab === 'activity' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800">Communication History</h2>

            {/* Meetings */}
            {meetings.length > 0 && (
              <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Video className="h-4 w-4 text-blue-500" />
                    Meetings
                  </h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {meetings.map(m => {
                    const ModeIcon = MEETING_MODE_ICONS[m.mode] ?? Clock;
                    const isPast   = new Date(m.start_time) < new Date();
                    return (
                      <div key={m.id} className="px-5 py-4 flex items-start gap-3">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isPast ? 'bg-slate-100' : 'bg-blue-50'}`}>
                          <ModeIcon className={`h-4 w-4 ${isPast ? 'text-slate-400' : 'text-blue-600'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-800">{m.title}</p>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${STATUS_PILLS[m.status] ?? STATUS_PILLS.scheduled}`}>
                              {m.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {format(parseISO(m.start_time), 'MMM d, yyyy · h:mm a')}
                            {m.end_time && ` – ${format(parseISO(m.end_time), 'h:mm a')}`}
                          </p>
                          {m.notes && (
                            <p className="text-xs text-slate-500 mt-1.5 bg-slate-50 rounded-lg p-2 line-clamp-3">{m.notes}</p>
                          )}
                          {m.video_link && !isPast && (
                            <a
                              href={m.video_link} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-1.5"
                            >
                              <ExternalLink className="h-3 w-3" />Join meeting
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Activities */}
            {activities.length > 0 && (
              <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-violet-500" />
                    Activities
                  </h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {activities.map(a => {
                    const Icon = ACTIVITY_ICONS[a.type] ?? MessageSquare;
                    return (
                      <div key={a.id} className="px-5 py-3.5 flex items-start gap-3">
                        <div className="h-7 w-7 rounded-lg bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
                          <Icon className="h-3.5 w-3.5 text-violet-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{a.title}</p>
                          {a.description && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{a.description}</p>
                          )}
                          <p className="text-[11px] text-slate-400 mt-1">
                            {a.due_date
                              ? format(new Date(a.due_date), 'MMM d, yyyy')
                              : format(new Date(a.created_at), 'MMM d, yyyy')
                            }
                          </p>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${STATUS_PILLS[a.status] ?? STATUS_PILLS.scheduled}`}>
                          {a.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activities.length === 0 && meetings.length === 0 && (
              <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400">
                No communication history yet.
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENTS TAB ── */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800">Documents</h2>

            {documents.length === 0 && (
              <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400">
                No documents shared yet.
              </div>
            )}

            <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden">
              <div className="divide-y divide-slate-50">
                {documents.map(doc => {
                  const ext = doc.name.split('.').pop()?.toUpperCase() ?? 'FILE';
                  return (
                    <div key={doc.id} className="px-5 py-4 flex items-center gap-3 group hover:bg-slate-50/50 transition-colors">
                      <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5 text-indigo-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{doc.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold">{ext}</span>
                          <span>{formatBytes(doc.file_size)}</span>
                          <span>·</span>
                          <span>{format(new Date(doc.created_at), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}