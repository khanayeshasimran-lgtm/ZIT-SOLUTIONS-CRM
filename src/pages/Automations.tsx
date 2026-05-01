/**
 * src/pages/Automations.tsx
 *
 * Workflow automation rules management UI.
 * Add to App.tsx: <Route path="/automations" element={<Automations />} />
 * Add to AppSidebar menuItems with icon Zap, path '/automations', roles admin+manager
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Zap, Plus, Trash2, CheckCircle2, XCircle,
  Clock, AlertCircle, ToggleLeft, ToggleRight,
  ChevronDown, ChevronUp, Activity,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  created_at: string;
  organization_id: string | null;
}

interface AutomationLog {
  id: string;
  rule_name: string | null;
  trigger_type: string;
  entity_type: string | null;
  action_taken: string;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

// ── Config options ────────────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { value: 'deal_stage_change', label: '📊 Deal stage changes',      configFields: ['stage'] },
  { value: 'deal_won',          label: '🎉 Deal is won',              configFields: [] },
  { value: 'idle_lead',         label: '😴 Lead goes idle',           configFields: ['idle_days'] },
  { value: 'stalled_deal',      label: '🚧 Deal stalls in stage',     configFields: ['stalled_days', 'stage'] },
  { value: 'overdue_task',      label: '⏰ Task becomes overdue',      configFields: [] },
];

const ACTION_OPTIONS = [
  { value: 'create_activity',    label: '📋 Create follow-up activity' },
  { value: 'send_notification',  label: '🔔 Send notification to admins' },
  { value: 'update_lead_status', label: '🏷️ Update lead status' },
];

const STAGE_OPTIONS = [
  { value: 'new_lead',          label: 'New Lead' },
  { value: 'contacted',         label: 'Contacted' },
  { value: 'meeting_scheduled', label: 'Meeting Scheduled' },
  { value: 'proposal',          label: 'Proposal' },
  { value: 'negotiation',       label: 'Negotiation' },
  { value: 'won',               label: 'Won' },
  { value: 'lost',              label: 'Lost' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function TriggerBadge({ type }: { type: string }) {
  const opt = TRIGGER_OPTIONS.find(t => t.value === type);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">
      {opt?.label ?? type}
    </span>
  );
}

function ActionBadge({ type }: { type: string }) {
  const opt = ACTION_OPTIONS.find(a => a.value === type);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
      {opt?.label ?? type}
    </span>
  );
}

function RuleConfigSummary({ rule }: { rule: AutomationRule }) {
  const parts: string[] = [];
  const tc = rule.trigger_config;
  const ac = rule.action_config;

  if (tc.stage)        parts.push(`stage: ${tc.stage}`);
  if (tc.idle_days)    parts.push(`after ${tc.idle_days} idle days`);
  if (tc.stalled_days) parts.push(`stalled ${tc.stalled_days}+ days`);
  if (ac.due_days !== undefined) parts.push(`due in ${ac.due_days} day(s)`);
  if (ac.status)       parts.push(`→ status: ${ac.status}`);

  if (!parts.length) return null;
  return <p className="text-[11px] text-slate-400 mt-0.5">{parts.join(' · ')}</p>;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Automations() {
  const { user, profile, role } = useAuth();
  const { toast } = useToast();
  const canManage = role === 'admin' || role === 'manager';

  const [rules,        setRules]        = useState<AutomationRule[]>([]);
  const [logs,         setLogs]         = useState<AutomationLog[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showLogs,     setShowLogs]     = useState(false);
  const [isAddOpen,    setIsAddOpen]    = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<AutomationRule | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: '', description: '', trigger_type: 'deal_stage_change',
    action_type: 'create_activity',
    // trigger config fields
    tc_stage: '', tc_idle_days: '', tc_stalled_days: '',
    // action config fields
    ac_title: '', ac_type: 'follow_up', ac_due_days: '2',
    ac_event: 'idle_lead', ac_subject: '', ac_body_template: '',
    ac_status: 'contacted',
  });

  const fetchRules = async () => {
    const { data, error } = await supabase
      .from('automation_rules')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setRules(data ?? []);
    setLoading(false);
  };

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('automation_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setLogs(data ?? []);
  };

  useEffect(() => { fetchRules(); }, []);
  useEffect(() => { if (showLogs) fetchLogs(); }, [showLogs]);

  const handleToggle = async (rule: AutomationRule) => {
    const { error } = await supabase
      .from('automation_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id);
    if (error) { toast({ title: 'Failed to toggle rule', variant: 'destructive' }); return; }
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
    toast({ title: rule.is_active ? 'Rule disabled' : 'Rule enabled ✅' });
  };

  const handleDelete = async () => {
    if (!ruleToDelete) return;
    const { error } = await supabase.from('automation_rules').delete().eq('id', ruleToDelete.id);
    if (error) { toast({ title: 'Delete failed', variant: 'destructive' }); return; }
    toast({ title: 'Rule deleted' });
    setRuleToDelete(null);
    fetchRules();
  };

  const buildTriggerConfig = (): Record<string, unknown> => {
    const cfg: Record<string, unknown> = {};
    if (form.tc_stage)        cfg.stage        = form.tc_stage;
    if (form.tc_idle_days)    cfg.idle_days    = Number(form.tc_idle_days);
    if (form.tc_stalled_days) cfg.stalled_days = Number(form.tc_stalled_days);
    return cfg;
  };

  const buildActionConfig = (): Record<string, unknown> => {
    if (form.action_type === 'create_activity') {
      return { title: form.ac_title, type: form.ac_type, due_days: Number(form.ac_due_days) };
    }
    if (form.action_type === 'send_notification') {
      return { event: form.ac_event, subject: form.ac_subject, body_template: form.ac_body_template };
    }
    if (form.action_type === 'update_lead_status') {
      return { status: form.ac_status };
    }
    return {};
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    const orgId = (profile as any)?.organization_id;

    const { error } = await supabase.from('automation_rules').insert([{
      name:            form.name,
      description:     form.description || null,
      trigger_type:    form.trigger_type,
      trigger_config:  buildTriggerConfig(),
      action_type:     form.action_type,
      action_config:   buildActionConfig(),
      organization_id: orgId,
      created_by:      user?.id,
    }]);

    if (error) { toast({ title: 'Failed to create rule', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Automation rule created ✅' });
    setIsAddOpen(false);
    fetchRules();
  };

  const selectedTrigger = TRIGGER_OPTIONS.find(t => t.value === form.trigger_type);
  const activeCount  = rules.filter(r => r.is_active).length;
  const orgRuleCount = rules.filter(r => r.organization_id !== null).length;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 py-6">

      {/* ── HEADER ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-indigo-500" /> Workflow Automations
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeCount} active rule{activeCount !== 1 ? 's' : ''} · {orgRuleCount} custom · {rules.length - orgRuleCount} system defaults
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowLogs(v => !v)}
          >
            <Activity className="mr-2 h-4 w-4" />
            {showLogs ? 'Hide' : 'View'} Logs
            {showLogs ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
          </Button>
          {canManage && (
            <Button onClick={() => setIsAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />New Rule
            </Button>
          )}
        </div>
      </div>

      {/* ── STATS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Rules',    value: rules.length,                        icon: '⚙️', color: 'text-slate-700' },
          { label: 'Active',         value: activeCount,                          icon: '✅', color: 'text-emerald-600' },
          { label: 'Custom Rules',   value: orgRuleCount,                         icon: '🎯', color: 'text-indigo-600' },
          { label: 'System Defaults',value: rules.length - orgRuleCount,          icon: '🔧', color: 'text-amber-600' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</span>
              <span className="text-lg">{stat.icon}</span>
            </div>
            <p className={`text-2xl font-black tabular-nums ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ── LOGS ── */}
      {showLogs && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_6px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Execution Log</h2>
            <span className="text-xs text-slate-400">Last 50 executions</span>
          </div>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
              <Activity className="h-8 w-8 opacity-30" />
              <p className="text-sm">No automation executions yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 px-5 py-3.5">
                  {log.success
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    : <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-slate-800 truncate">{log.rule_name ?? '—'}</span>
                      <TriggerBadge type={log.trigger_type} />
                    </div>
                    <p className="text-[12px] text-slate-500 mt-0.5 truncate">{log.action_taken}</p>
                    {log.error_message && (
                      <p className="text-[11px] text-red-500 mt-0.5 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />{log.error_message}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(log.created_at), 'MMM d, HH:mm')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── RULES LIST ── */}
      <div className="space-y-3">
        {rules.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 flex flex-col items-center gap-3 text-slate-400">
            <Zap className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">No automation rules yet</p>
            {canManage && <Button onClick={() => setIsAddOpen(true)}>Create your first rule</Button>}
          </div>
        ) : (
          rules.map(rule => (
            <div
              key={rule.id}
              className={`rounded-2xl border bg-white shadow-[0_1px_6px_rgba(0,0,0,0.04)] p-5 transition-all ${rule.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}
            >
              <div className="flex items-start gap-4">
                {/* Toggle */}
                <button
                  onClick={() => canManage && handleToggle(rule)}
                  disabled={!canManage}
                  title={rule.is_active ? 'Disable rule' : 'Enable rule'}
                  className="mt-0.5 shrink-0"
                >
                  {rule.is_active
                    ? <ToggleRight className="h-6 w-6 text-indigo-500" />
                    : <ToggleLeft className="h-6 w-6 text-slate-300" />
                  }
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-[14px] font-bold text-slate-800">{rule.name}</span>
                    {rule.organization_id === null && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">system default</span>
                    )}
                  </div>
                  {rule.description && <p className="text-[12px] text-slate-500 mb-2">{rule.description}</p>}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-slate-400 font-medium">WHEN</span>
                    <TriggerBadge type={rule.trigger_type} />
                    <span className="text-[11px] text-slate-400 font-medium">THEN</span>
                    <ActionBadge type={rule.action_type} />
                  </div>
                  <RuleConfigSummary rule={rule} />
                </div>

                {/* Actions */}
                {canManage && rule.organization_id !== null && (
                  <button
                    onClick={() => setRuleToDelete(rule)}
                    className="shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── ADD RULE DIALOG ── */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-indigo-500" /> New Automation Rule
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">

            <div className="space-y-2">
              <Label>Rule name *</Label>
              <Input
                required
                placeholder="e.g. Proposal follow-up"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Optional — describe what this rule does"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
            </div>

            {/* ── TRIGGER ── */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">WHEN (Trigger)</p>
              <div className="space-y-2">
                <Label>Trigger event</Label>
                <Select value={form.trigger_type} onValueChange={v => setForm({ ...form, trigger_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGER_OPTIONS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTrigger?.configFields.includes('stage') && (
                <div className="space-y-2">
                  <Label>Stage (optional — leave blank to match any stage)</Label>
                  <Select value={form.tc_stage} onValueChange={v => setForm({ ...form, tc_stage: v })}>
                    <SelectTrigger><SelectValue placeholder="Any stage" /></SelectTrigger>
                    <SelectContent>
                      {STAGE_OPTIONS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedTrigger?.configFields.includes('idle_days') && (
                <div className="space-y-2">
                  <Label>Idle days threshold</Label>
                  <Input
                    type="number" min={1} placeholder="5"
                    value={form.tc_idle_days}
                    onChange={e => setForm({ ...form, tc_idle_days: e.target.value })}
                  />
                </div>
              )}

              {selectedTrigger?.configFields.includes('stalled_days') && (
                <div className="space-y-2">
                  <Label>Stalled days threshold</Label>
                  <Input
                    type="number" min={1} placeholder="7"
                    value={form.tc_stalled_days}
                    onChange={e => setForm({ ...form, tc_stalled_days: e.target.value })}
                  />
                </div>
              )}
            </div>

            {/* ── ACTION ── */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">THEN (Action)</p>
              <div className="space-y-2">
                <Label>Action</Label>
                <Select value={form.action_type} onValueChange={v => setForm({ ...form, action_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTION_OPTIONS.map(a => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.action_type === 'create_activity' && (
                <>
                  <div className="space-y-2">
                    <Label>Activity title</Label>
                    <Input
                      placeholder="e.g. Follow up on proposal"
                      value={form.ac_title}
                      onChange={e => setForm({ ...form, ac_title: e.target.value })}
                    />
                    <p className="text-[11px] text-slate-400">Use {'{{deal_title}}'} or {'{{lead_name}}'} for dynamic values</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Activity type</Label>
                      <Select value={form.ac_type} onValueChange={v => setForm({ ...form, ac_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['follow_up','call','email','meeting','task'].map(t => (
                            <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Due in (days)</Label>
                      <Input
                        type="number" min={0}
                        value={form.ac_due_days}
                        onChange={e => setForm({ ...form, ac_due_days: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}

              {form.action_type === 'send_notification' && (
                <>
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input
                      placeholder="e.g. Deal stalled: {{deal_title}}"
                      value={form.ac_subject}
                      onChange={e => setForm({ ...form, ac_subject: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Message body</Label>
                    <Input
                      placeholder="e.g. {{deal_title}} has been idle for {{idle_days}} days"
                      value={form.ac_body_template}
                      onChange={e => setForm({ ...form, ac_body_template: e.target.value })}
                    />
                    <p className="text-[11px] text-slate-400">Variables: {'{{deal_title}}'} {'{{lead_name}}'} {'{{stage}}'} {'{{idle_days}}'} {'{{value}}'}</p>
                  </div>
                </>
              )}

              {form.action_type === 'update_lead_status' && (
                <div className="space-y-2">
                  <Label>Set lead status to</Label>
                  <Select value={form.ac_status} onValueChange={v => setForm({ ...form, ac_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['new','contacted','qualified','unqualified'].map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit">
                <Zap className="mr-2 h-4 w-4" />Create Rule
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRM ── */}
      <AlertDialog open={!!ruleToDelete} onOpenChange={() => setRuleToDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{ruleToDelete?.name}</strong> will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}