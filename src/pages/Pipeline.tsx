import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/lib/audit';
import { PageLoader } from '@/components/PageLoader';
import { useLocation, useNavigate } from 'react-router-dom';
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/export';
import { format } from 'date-fns';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { notifyDealWon } from '@/services/notifications.service';
import {
  Plus, Pencil, Trash2, ClipboardList, X, Search,
  TrendingUp, DollarSign, Target, BarChart2,
  ArrowRight, Clock, AlertCircle, CheckCircle2,
  Download, FileText, FileSpreadsheet,
} from 'lucide-react';

type DealStage =
  | 'new_lead' | 'contacted' | 'meeting_scheduled'
  | 'proposal' | 'negotiation' | 'won' | 'lost';

interface Deal {
  id: string;
  title: string;
  stage: DealStage;
  value: number;
  probability: number;
  expected_close_date: string | null;
  created_at: string;
  leads?: { name: string } | null;
}

const STAGE_CFG: Record<DealStage, {
  label: string; accent: string; light: string; dot: string;
  bar: string; pill: string; textColor: string; emoji: string;
}> = {
  new_lead:          { label: 'New Lead',    accent: '#6366f1', light: '#eef2ff', dot: 'bg-indigo-400',  bar: 'bg-indigo-400',  pill: 'bg-indigo-50 text-indigo-700 ring-indigo-200',    textColor: 'text-indigo-600',  emoji: '🌱' },
  contacted:         { label: 'Contacted',   accent: '#0ea5e9', light: '#f0f9ff', dot: 'bg-sky-400',     bar: 'bg-sky-400',     pill: 'bg-sky-50 text-sky-700 ring-sky-200',             textColor: 'text-sky-600',     emoji: '📞' },
  meeting_scheduled: { label: 'Meeting',     accent: '#8b5cf6', light: '#f5f3ff', dot: 'bg-violet-400',  bar: 'bg-violet-400',  pill: 'bg-violet-50 text-violet-700 ring-violet-200',    textColor: 'text-violet-600',  emoji: '📅' },
  proposal:          { label: 'Proposal',    accent: '#f59e0b', light: '#fffbeb', dot: 'bg-amber-400',   bar: 'bg-amber-400',   pill: 'bg-amber-50 text-amber-700 ring-amber-200',       textColor: 'text-amber-600',   emoji: '📋' },
  negotiation:       { label: 'Negotiation', accent: '#f97316', light: '#fff7ed', dot: 'bg-orange-400',  bar: 'bg-orange-400',  pill: 'bg-orange-50 text-orange-700 ring-orange-200',    textColor: 'text-orange-600',  emoji: '⚡' },
  won:               { label: 'Won',         accent: '#10b981', light: '#ecfdf5', dot: 'bg-emerald-400', bar: 'bg-emerald-400', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', textColor: 'text-emerald-600', emoji: '🎉' },
  lost:              { label: 'Lost',        accent: '#94a3b8', light: '#f8fafc', dot: 'bg-slate-300',   bar: 'bg-slate-300',   pill: 'bg-slate-100 text-slate-500 ring-slate-200',      textColor: 'text-slate-500',   emoji: '🔒' },
};

const STAGE_ORDER: DealStage[] = ['new_lead','contacted','meeting_scheduled','proposal','negotiation','won','lost'];

function AgeBadge({ createdAt }: { createdAt: string }) {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (days > 14) return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-50 rounded-full px-2 py-0.5">
      <AlertCircle className="h-2.5 w-2.5" />{days}d
    </span>
  );
  if (days > 7) return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-50 rounded-full px-2 py-0.5">
      <Clock className="h-2.5 w-2.5" />{days}d
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
      <Clock className="h-2.5 w-2.5" />{days === 0 ? 'today' : `${days}d`}
    </span>
  );
}

function DealAvatar({ title }: { title: string }) {
  const initials = title.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['from-indigo-400 to-indigo-600','from-sky-400 to-sky-600','from-violet-400 to-violet-600','from-amber-400 to-amber-600','from-emerald-400 to-emerald-600','from-pink-400 to-pink-600'];
  return (
    <div className={`h-7 w-7 rounded-full bg-gradient-to-br ${colors[title.charCodeAt(0) % colors.length]} flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm`}>
      {initials}
    </div>
  );
}

export default function Pipeline() {
  const { user, role, profile } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const canManageDeals = role === 'admin' || role === 'manager';

  const [deals,         setDeals]         = useState<Deal[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [isAddOpen,     setIsAddOpen]     = useState(false);
  const [isEditOpen,    setIsEditOpen]    = useState(false);
  const [dealToEdit,    setDealToEdit]    = useState<Deal | null>(null);
  const [dealToDelete,  setDealToDelete]  = useState<Deal | null>(null);
  const [incomingLead,  setIncomingLead]  = useState<{ id: string; name: string } | null>(null);
  const [search,        setSearch]        = useState('');
  const [stageFilter,   setStageFilter]   = useState<DealStage | 'all'>('all');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [formData, setFormData] = useState({
    title: '', value: '', stage: 'new_lead' as DealStage, probability: '', expected_close_date: '',
  });

  // ── DRAG STATE ──────────────────────────────────────────────────────────────
  const dragDealId   = useRef<string | null>(null);
  const [dragOver,   setDragOver]   = useState<DealStage | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    dragDealId.current = dealId;
    setDraggingId(dealId);
    e.dataTransfer.effectAllowed = 'move';
    const ghost = document.createElement('div');
    ghost.style.cssText = 'position:fixed;top:-200px;left:-200px;width:1px;height:1px;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragEnd = () => {
    dragDealId.current = null;
    setDraggingId(null);
    setDragOver(null);
  };

  const handleDragOver = (e: React.DragEvent, stage: DealStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(stage);
  };

  const handleDrop = async (e: React.DragEvent, targetStage: DealStage) => {
    e.preventDefault();
    setDragOver(null);
    const id = dragDealId.current;
    if (!id) return;

    const deal = deals.find(d => d.id === id);
    if (!deal || deal.stage === targetStage) return;

    setDeals(prev => prev.map(d => d.id === id ? { ...d, stage: targetStage } : d));

    const { error } = await supabase
      .from('deals')
      .update({ stage: targetStage })
      .eq('id', id);

    if (error) {
      toast({ title: 'Failed to move deal', description: error.message, variant: 'destructive' });
      setDeals(prev => prev.map(d => d.id === id ? { ...d, stage: deal.stage } : d));
    } else {
      toast({ title: `Moved to ${STAGE_CFG[targetStage].label} ${STAGE_CFG[targetStage].emoji}` });

      if (targetStage === 'won') {
        await notifyDealWon({
          dealTitle: deal.title,
          value: Number(deal.value),
          wonBy: profile?.email ?? user?.email,
        });
      }

logAudit({ userId: user?.id, userEmail: profile?.email ?? user?.email, action: 'UPDATE', entity: 'deals', entityId: id });
    }
  };
  // ────────────────────────────────────────────────────────────────────────────

  const fetchDeals = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('deals')
      .select('id, title, stage, value, probability, expected_close_date, created_at, leads(name)')
      .order('created_at', { ascending: false });
    if (error) { toast({ title: 'Failed to fetch deals', description: error.message, variant: 'destructive' }); setDeals([]); }
    else setDeals(data as Deal[]);
    setLoading(false);
  };

  useEffect(() => { if (user) fetchDeals(); }, [user]);

  useEffect(() => {
    const lead = location.state?.lead;
    if (lead && canManageDeals) {
      setIncomingLead(lead);
      setFormData(prev => ({ ...prev, title: `Deal from ${lead.name}`, stage: 'new_lead' }));
      setIsAddOpen(true);
    }
  }, [location.key, canManageDeals]);

  const resetForm = () => {
    setFormData({ title: '', value: '', stage: 'new_lead', probability: '', expected_close_date: '' });
    setDealToEdit(null);
    setIncomingLead(null);
  };

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    const rows = deals.map(deal => ({
      Lead: deal.leads?.name ?? '—', Stage: deal.stage, Value: deal.value,
      Probability: deal.probability ?? 0, ExpectedCloseDate: deal.expected_close_date ?? '—',
      CreatedAt: new Date(deal.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    }));
    if (type === 'csv')   exportToCSV('pipeline', rows);
    if (type === 'excel') exportToExcel('pipeline', rows);
    if (type === 'pdf')   exportToPDF('pipeline', rows, { title: 'ZIT Solutions – CRM', subtitle: 'Pipeline – Deals Report', exportedBy: profile?.email ?? user?.email ?? 'System' });
    logAudit({ userId: user?.id, userEmail: profile?.email ?? user?.email, action: 'EXPORT', entity: 'deals', entityId: `${type.toUpperCase()} (${rows.length} rows)` });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageDeals) return;
    const { error } = await supabase.from('deals').insert([{
      title: formData.title, value: Number(formData.value) || 0, stage: formData.stage,
      probability: Number(formData.probability) || 0, expected_close_date: formData.expected_close_date || null,
      created_by: user?.id, lead_id: incomingLead?.id ?? null,
    }]);
    if (incomingLead?.id) await supabase.from('leads').update({ status: 'qualified' }).eq('id', incomingLead.id);
    if (error) { toast({ title: 'Failed to create deal', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Deal created 🎉' });
    setIsAddOpen(false);
    resetForm();
    window.history.replaceState({}, document.title);
    fetchDeals();
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealToEdit || !canManageDeals) return;
    const { error } = await supabase.from('deals').update({
      title: formData.title, value: Number(formData.value), stage: formData.stage,
      probability: Number(formData.probability), expected_close_date: formData.expected_close_date || null,
    }).eq('id', dealToEdit.id);
    if (error) { toast({ title: 'Deal update failed', variant: 'destructive' }); return; }
    toast({ title: 'Deal updated' });
    setIsEditOpen(false);
    resetForm();
    fetchDeals();
  };

  const handleDelete = async () => {
    if (!dealToDelete || !canManageDeals) return;
    const { error } = await supabase.from('deals').delete().eq('id', dealToDelete.id);
    if (error) {
      if (error.message.includes('foreign key') || error.message.includes('violates')) {
        toast({ variant: 'destructive', title: 'Cannot delete deal', description: 'This deal has activities linked. Delete them first.' }); return;
      }
      toast({ variant: 'destructive', title: 'Delete failed', description: error.message }); return;
    }
    toast({ title: 'Deal deleted' }); setDealToDelete(null); fetchDeals();
  };

  const totalValue  = deals.filter(d => d.stage !== 'lost').reduce((s, d) => s + Number(d.value || 0), 0);
  const wonValue    = deals.filter(d => d.stage === 'won').reduce((s, d) => s + Number(d.value || 0), 0);
  const activeCount = deals.filter(d => !['won','lost'].includes(d.stage)).length;
  const winRate     = deals.length ? Math.round((deals.filter(d => d.stage === 'won').length / deals.length) * 100) : 0;
  const fmt         = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

  const filtered = deals.filter(d => {
    const nameMatch  = !search || d.title.toLowerCase().includes(search.toLowerCase()) || (d.leads?.name || '').toLowerCase().includes(search.toLowerCase());
    const stageMatch = stageFilter === 'all' || d.stage === stageFilter;
    return nameMatch && stageMatch;
  });
  const grouped = STAGE_ORDER.reduce((acc, s) => { acc[s] = filtered.filter(d => d.stage === s); return acc; }, {} as Record<DealStage, Deal[]>);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">

      {/* ── HEADER ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales Pipeline</h1>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-sm">
            <span>{deals.length} total deals</span>
            <span className="text-border hidden sm:inline">·</span>
            <span className="flex items-center gap-1 text-indigo-600 font-medium"><TrendingUp className="h-3.5 w-3.5" />{activeCount} active</span>
            <span className="text-border hidden sm:inline">·</span>
            <span className="flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle2 className="h-3.5 w-3.5" />{winRate}% win rate</span>
            <span className="text-border hidden sm:inline">·</span>
            <span className="flex items-center gap-1 text-amber-600 font-medium"><DollarSign className="h-3.5 w-3.5" />{fmt(wonValue)} closed</span>
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant={showAnalytics ? 'default' : 'outline'} onClick={() => setShowAnalytics(v => !v)}>
            <BarChart2 className="mr-2 h-4 w-4" />Analytics
          </Button>
          {role === 'admin' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline"><Download className="mr-2 h-4 w-4" />Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('csv')}><FileText className="mr-2 h-4 w-4" />CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('pdf')}><FileText className="mr-2 h-4 w-4" />PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canManageDeals && (
            <Button onClick={() => { resetForm(); setIsAddOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />Add Deal
            </Button>
          )}
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search deals…"
            className="pl-8 pr-8 py-2 w-48 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setStageFilter('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${stageFilter === 'all' ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
          >
            All
          </button>
          {STAGE_ORDER.map(stage => {
            const count  = deals.filter(d => d.stage === stage).length;
            const cfg    = STAGE_CFG[stage];
            const active = stageFilter === stage;
            return (
              <button
                key={stage}
                onClick={() => setStageFilter(active ? 'all' : stage)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ring-1 ${active ? `${cfg.pill} shadow-sm` : 'bg-background text-muted-foreground ring-border hover:ring-input hover:bg-muted/50'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
                {count > 0 && <span className={`rounded-full px-1.5 text-[10px] font-bold ${active ? 'bg-white/60' : 'bg-muted text-muted-foreground'}`}>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── ANALYTICS ── */}
      {showAnalytics && (() => {
        const pipelineStages = STAGE_ORDER.filter(s => s !== 'won' && s !== 'lost');
        const maxCount = Math.max(...STAGE_ORDER.map(s => deals.filter(d => d.stage === s).length), 1);
        const maxVal   = Math.max(...STAGE_ORDER.map(s => deals.filter(d => d.stage === s).reduce((sum, d) => sum + Number(d.value || 0), 0)), 1);
        const avgDeal  = deals.length > 0 ? totalValue / deals.length : 0;
        const closedTotal = deals.filter(d => ['won','lost'].includes(d.stage)).length;
        const convRate = closedTotal > 0 ? Math.round((deals.filter(d => d.stage === 'won').length / closedTotal) * 100) : 0;

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Pipeline Value', value: fmt(totalValue), sub: 'excl. lost deals', icon: '💰', gradient: 'from-indigo-500 to-violet-600', bg: 'bg-indigo-50', text: 'text-indigo-700' },
                { label: 'Won Revenue',    value: fmt(wonValue),   sub: `${deals.filter(d=>d.stage==='won').length} deals closed`, icon: '🏆', gradient: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50', text: 'text-emerald-700' },
                { label: 'Avg. Deal Size', value: fmt(avgDeal),    sub: `across ${deals.length} deals`, icon: '📊', gradient: 'from-amber-500 to-orange-500', bg: 'bg-amber-50', text: 'text-amber-700' },
                { label: 'Close Rate',     value: `${convRate}%`,  sub: `${closedTotal} closed deals`, icon: '🎯', gradient: 'from-pink-500 to-rose-600', bg: 'bg-pink-50', text: 'text-pink-700' },
              ].map(kpi => (
                <div key={kpi.label} className="relative rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
                  <div className={`absolute inset-0 opacity-[0.04] bg-gradient-to-br ${kpi.gradient}`} />
                  <div className="relative p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{kpi.label}</span>
                      <span className={`text-lg h-8 w-8 rounded-xl ${kpi.bg} flex items-center justify-center`}>{kpi.icon}</span>
                    </div>
                    <p className={`text-2xl font-black tabular-nums ${kpi.text}`}>{kpi.value}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{kpi.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3 rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_6px_rgba(0,0,0,0.04)] p-5">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-sm font-bold text-slate-800">Deal Volume by Stage</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Number of deals · bar height = count</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-400 bg-slate-100 rounded-lg px-2.5 py-1">{deals.length} total</span>
                </div>
                <div className="flex items-end gap-2 h-36">
                  {STAGE_ORDER.map(stage => {
                    const cfg = STAGE_CFG[stage];
                    const cnt = deals.filter(d => d.stage === stage).length;
                    const pct = Math.round((cnt / maxCount) * 100);
                    return (
                      <div key={stage} className="flex-1 flex flex-col items-center gap-1.5 group">
                        <span className="text-[10px] font-bold tabular-nums" style={{ color: cnt > 0 ? cfg.accent : '#cbd5e1' }}>{cnt > 0 ? cnt : ''}</span>
                        <div className="w-full relative rounded-t-lg overflow-hidden bg-slate-100" style={{ height: '96px' }}>
                          <div
                            className="absolute bottom-0 w-full rounded-t-lg transition-all duration-700 ease-out"
                            style={{ height: `${Math.max(pct, cnt > 0 ? 6 : 0)}%`, background: `linear-gradient(to top, ${cfg.accent}cc, ${cfg.accent}55)` }}
                          />
                        </div>
                        <span className="text-[9px] font-semibold text-slate-400 group-hover:text-slate-600 transition-colors text-center leading-tight">{cfg.label.split(' ')[0]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-2 rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_6px_rgba(0,0,0,0.04)] p-5">
                <div className="mb-5">
                  <p className="text-sm font-bold text-slate-800">Pipeline Funnel</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Value flow through stages</p>
                </div>
                <div className="space-y-2">
                  {pipelineStages.map((stage) => {
                    const cfg = STAGE_CFG[stage];
                    const val = deals.filter(d => d.stage === stage).reduce((s, d) => s + Number(d.value || 0), 0);
                    const pct = Math.round((val / maxVal) * 100);
                    return (
                      <div key={stage} className="flex items-center gap-2">
                        <span className="text-xs w-4 text-center">{cfg.emoji}</span>
                        <div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden">
                          <div
                            className="h-full rounded-lg flex items-center px-2 transition-all duration-700"
                            style={{ width: `${Math.max(pct, val > 0 ? 8 : 0)}%`, background: `linear-gradient(to right, ${cfg.accent}dd, ${cfg.accent}88)` }}
                          >
                            {val > 0 && <span className="text-[9px] font-bold text-white truncate">{fmt(val)}</span>}
                          </div>
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400 w-6 text-right tabular-nums">
                          {deals.filter(d => d.stage === stage).length}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_6px_rgba(0,0,0,0.04)] p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-slate-800">Stage Breakdown</p>
                <p className="text-[11px] text-slate-400">Deal value distribution</p>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden mb-4 gap-px">
                {STAGE_ORDER.map(stage => {
                  const cfg = STAGE_CFG[stage];
                  const val = deals.filter(d => d.stage === stage).reduce((s, d) => s + Number(d.value || 0), 0);
                  const allVal = deals.reduce((s, d) => s + Number(d.value || 0), 0);
                  const pct = allVal > 0 ? (val / allVal) * 100 : 0;
                  if (pct === 0) return null;
                  return <div key={stage} style={{ width: `${pct}%`, backgroundColor: cfg.accent }} title={`${cfg.label}: ${fmt(val)}`} />;
                })}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {STAGE_ORDER.map(stage => {
                  const cfg = STAGE_CFG[stage];
                  const cnt = deals.filter(d => d.stage === stage).length;
                  const val = deals.filter(d => d.stage === stage).reduce((s, d) => s + Number(d.value || 0), 0);
                  return (
                    <div key={stage} className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cfg.accent }} />
                        <span className="text-[11px] font-semibold text-slate-600 truncate">{cfg.label}</span>
                      </div>
                      <p className="text-[13px] font-black tabular-nums" style={{ color: cnt > 0 ? cfg.accent : '#cbd5e1' }}>{cnt > 0 ? cnt : '—'}</p>
                      <p className="text-[10px] text-slate-400 tabular-nums">{val > 0 ? fmt(val) : '—'}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── PIPELINE KANBAN ── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))' }}>
        {STAGE_ORDER.map(stage => {
          const cfg        = STAGE_CFG[stage];
          const stageDeals = [...(grouped[stage] || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          const isOver     = dragOver === stage;

          return (
            <div
              key={stage}
              className="flex flex-col rounded-2xl overflow-hidden border border-slate-200/70 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-150"
              style={{
                borderTop: `3px solid ${cfg.accent}`,
                boxShadow: isOver ? `0 0 0 2px ${cfg.accent}40, 0 8px 32px rgba(0,0,0,0.10)` : undefined,
                background: isOver ? cfg.light : undefined,
              }}
              onDragOver={e => handleDragOver(e, stage)}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => handleDrop(e, stage)}
            >
              <div className="flex-shrink-0 px-4 pt-3.5 pb-3 bg-white border-b border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm leading-none">{cfg.emoji}</span>
                    <span className="text-[13px] font-bold text-slate-800">{cfg.label}</span>
                  </div>
                  {stageDeals.length > 0 && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: cfg.light, color: cfg.accent }}>{stageDeals.length}</span>
                  )}
                </div>
                {stageDeals.length > 0 && (
                  <p className="text-[11px] font-semibold" style={{ color: cfg.accent }}>
                    {fmt(stageDeals.reduce((s, d) => s + Number(d.value || 0), 0))}
                  </p>
                )}
                <div className="mt-2 h-0.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${cfg.bar} transition-all duration-500`} style={{ width: stageDeals.length > 0 ? '100%' : '0%' }} />
                </div>
              </div>

              <div
                className="overflow-y-auto px-2.5 pb-2.5 pt-2.5 space-y-2.5 bg-white/30 transition-colors duration-150"
                style={{ height: '185px' }}
              >
                {stageDeals.length === 0 ? (
                  <div className={`flex flex-col items-center justify-center gap-2 h-full select-none transition-all duration-150 ${isOver ? 'opacity-100' : ''}`}>
                    {isOver ? (
                      <div
                        className="w-full h-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all"
                        style={{ borderColor: cfg.accent, background: cfg.light }}
                      >
                        <span className="text-xl">{cfg.emoji}</span>
                        <p className="text-[11px] font-bold" style={{ color: cfg.accent }}>Drop here</p>
                      </div>
                    ) : (
                      <>
                        <div className="h-8 w-8 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center">
                          <Plus className="h-3.5 w-3.5 text-slate-300" />
                        </div>
                        <p className="text-[11px] font-medium text-slate-300">No deals</p>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {isOver && (
                      <div
                        className="w-full rounded-xl border-2 border-dashed flex items-center justify-center py-2 transition-all"
                        style={{ borderColor: cfg.accent, background: cfg.light }}
                      >
                        <p className="text-[11px] font-bold" style={{ color: cfg.accent }}>Drop here</p>
                      </div>
                    )}
                    {stageDeals.map(deal => (
                      <div
                        key={deal.id}
                        draggable={canManageDeals}
                        onDragStart={e => handleDragStart(e, deal.id)}
                        onDragEnd={handleDragEnd}
                        className={`group relative rounded-xl bg-white border overflow-hidden transition-all duration-150 shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] ${canManageDeals ? 'cursor-grab active:cursor-grabbing' : ''} ${draggingId === deal.id ? 'border-dashed border-slate-300 bg-slate-50/60' : 'border-slate-200/80 hover:border-slate-300/80'}`}
                      >
                        <div className="absolute left-0 inset-y-0 w-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ backgroundColor: cfg.accent }} />
                        <div className="p-3.5">
                          <div className="flex items-start gap-2.5 mb-2.5">
                            <DealAvatar title={deal.title} />
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-bold text-slate-900 leading-tight truncate">{deal.title}</p>
                              {deal.leads?.name && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{deal.leads.name}</p>}
                            </div>
                          </div>
                          <div className="h-px bg-gradient-to-r from-transparent via-slate-100 to-transparent my-2" />
                          <div className="flex items-center gap-2 mb-2.5">
                            <div className="flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">
                              <DollarSign className="h-3 w-3 text-slate-400" />{fmt(Number(deal.value))}
                            </div>
                            {deal.probability > 0 && (
                              <div className="flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">
                                <Target className="h-3 w-3 text-slate-400" />{deal.probability}%
                              </div>
                            )}
                          </div>
                          {deal.expected_close_date && (
                            <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5 mb-2.5 text-[11px] font-medium text-slate-500">
                              <ArrowRight className="h-3 w-3 shrink-0" />{format(new Date(deal.expected_close_date), 'MMM d, yyyy')}
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <AgeBadge createdAt={deal.created_at} />
                            {canManageDeals && (
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-150">
                                <button
                                  onClick={() => {
                                    setDealToEdit(deal);
                                    setFormData({ title: deal.title, value: String(deal.value), stage: deal.stage, probability: String(deal.probability ?? 0), expected_close_date: deal.expected_close_date ?? '' });
                                    setIsEditOpen(true);
                                  }}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                ><Pencil className="h-3.5 w-3.5" /></button>
                                <button
                                  onClick={() => navigate('/activities', { state: { dealId: deal.id } })}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                ><ClipboardList className="h-3.5 w-3.5" /></button>
                                <button
                                  onClick={() => setDealToDelete(deal)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                ><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── ADD DIALOG (Leads-style) ── */}
      <Dialog open={isAddOpen} onOpenChange={o => { setIsAddOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Deal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            {incomingLead && (
              <p className="text-sm text-muted-foreground">
                Converting lead: <span className="font-medium text-foreground">{incomingLead.name}</span>
              </p>
            )}
            <div className="space-y-2">
              <Label>Deal Title *</Label>
              <Input
                required
                placeholder="e.g. Acme Corp Enterprise Deal"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Value ($)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.value}
                  onChange={e => setFormData({ ...formData, value: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Probability (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="70"
                  value={formData.probability}
                  onChange={e => setFormData({ ...formData, probability: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={formData.stage} onValueChange={v => setFormData({ ...formData, stage: v as DealStage })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_ORDER.map(s => (
                    <SelectItem key={s} value={s}>{STAGE_CFG[s].emoji} {STAGE_CFG[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expected Close Date</Label>
              <Input
                type="date"
                value={formData.expected_close_date}
                onChange={e => setFormData({ ...formData, expected_close_date: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setIsAddOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit">
                <Plus className="mr-2 h-4 w-4" />Create Deal
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── EDIT DIALOG (Leads-style) ── */}
      <Dialog open={isEditOpen} onOpenChange={o => { setIsEditOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Deal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>Deal Title</Label>
              <Input
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Value ($)</Label>
                <Input
                  type="number"
                  value={formData.value}
                  onChange={e => setFormData({ ...formData, value: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Probability (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={formData.probability}
                  onChange={e => setFormData({ ...formData, probability: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={formData.stage} onValueChange={v => setFormData({ ...formData, stage: v as DealStage })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_ORDER.map(s => (
                    <SelectItem key={s} value={s}>{STAGE_CFG[s].emoji} {STAGE_CFG[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expected Close Date</Label>
              <Input
                type="date"
                value={formData.expected_close_date}
                onChange={e => setFormData({ ...formData, expected_close_date: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setIsEditOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit">Save Changes</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRM ── */}
      <AlertDialog open={!!dealToDelete} onOpenChange={() => setDealToDelete(null)}>
        <AlertDialogContent className="rounded-2xl border-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this deal?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-slate-700">{dealToDelete?.title}</strong> will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-red-500 hover:bg-red-600 text-white shadow-sm">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}