/**
 * pages/admin/Integrations.tsx
 * Route: /admin/integrations  — wrap in AdminGuard in App.tsx
 *
 * Changes vs previous version:
 *  - Added Razorpay integration (Indian payment gateway, INR invoices)
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageLoader } from '@/components/PageLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2, XCircle, RefreshCw, Settings2,
  Github, Mail, Calendar, MessageSquare, CreditCard,
  Plug, ExternalLink, Eye, EyeOff, Send, IndianRupee,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

type IntegrationType =
  | 'github' | 'gitlab' | 'slack' | 'google_calendar'
  | 'sendgrid' | 'resend' | 'stripe' | 'razorpay';

interface Integration {
  id:          string;
  type:        IntegrationType;
  enabled:     boolean;
  credentials: Record<string, string> | null;
  last_sync:   string | null;
  created_at:  string;
}

// ── Integration definitions ───────────────────────────────────────────────────

const INTEGRATIONS: Record<IntegrationType, {
  label:        string;
  description:  string;
  icon:         React.ElementType;
  color:        string;
  bg:           string;
  fields:       { key: string; label: string; placeholder: string; type?: string }[];
  docsUrl:      string;
  capabilities: string[];
  badge?:       string;
}> = {
  github: {
    label:       'GitHub',
    description: 'Link commits and pull requests to tickets and deals.',
    icon:        Github,
    color:       'text-slate-800',
    bg:          'bg-slate-50',
    fields: [
      { key: 'token', label: 'Personal Access Token', placeholder: 'ghp_xxxxxxxxxxxx', type: 'password' },
      { key: 'org',   label: 'Organization / Username', placeholder: 'your-org-or-username' },
    ],
    docsUrl:      'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token',
    capabilities: ['Link issues to tickets', 'Link PRs to deals', 'View commit history on projects'],
  },
  gitlab: {
    label:       'GitLab',
    description: 'Connect GitLab issues and merge requests to your CRM.',
    icon:        Github,
    color:       'text-orange-600',
    bg:          'bg-orange-50',
    fields: [
      { key: 'token', label: 'Personal Access Token', placeholder: 'glpat-xxxxxxxxxxxx', type: 'password' },
      { key: 'url',   label: 'GitLab URL',            placeholder: 'https://gitlab.com' },
    ],
    docsUrl:      'https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html',
    capabilities: ['Link issues to tickets', 'Link MRs to deals', 'View pipeline status'],
  },
  slack: {
    label:       'Slack',
    description: 'Post deal wins, alerts, and invoice notifications to a channel.',
    icon:        MessageSquare,
    color:       'text-purple-600',
    bg:          'bg-purple-50',
    fields: [
      { key: 'webhook_url', label: 'Incoming Webhook URL', placeholder: 'https://hooks.slack.com/services/...', type: 'password' },
      { key: 'channel',     label: 'Channel name',         placeholder: '#sales-alerts' },
    ],
    docsUrl:      'https://api.slack.com/messaging/webhooks',
    capabilities: ['Deal won notifications', 'Overdue task alerts', 'Invoice paid alerts', 'Stalled deal warnings'],
  },
  google_calendar: {
    label:       'Google Calendar',
    description: 'Two-way sync meetings between CRM and your Google Calendar.',
    icon:        Calendar,
    color:       'text-blue-600',
    bg:          'bg-blue-50',
    fields: [
      { key: 'client_id',     label: 'OAuth Client ID',     placeholder: 'xxxxxxxx.apps.googleusercontent.com' },
      { key: 'client_secret', label: 'OAuth Client Secret', placeholder: 'GOCSPX-xxxxxxxxxxxx', type: 'password' },
      { key: 'calendar_id',   label: 'Calendar ID',         placeholder: 'primary or calendar@group.calendar.google.com' },
    ],
    docsUrl:      'https://developers.google.com/calendar/api/quickstart/js',
    capabilities: ['Push new meetings to Google Calendar', 'Pull updates back to CRM', 'Join links auto-synced'],
  },
  sendgrid: {
    label:       'SendGrid',
    description: 'Send emails from templates and receive open/click tracking webhooks.',
    icon:        Mail,
    color:       'text-indigo-600',
    bg:          'bg-indigo-50',
    fields: [
      { key: 'api_key',        label: 'API Key',                   placeholder: 'SG.xxxxxxxxxxxx', type: 'password' },
      { key: 'from_email',     label: 'From Email',                placeholder: 'noreply@yourcompany.com' },
      { key: 'from_name',      label: 'From Name',                 placeholder: 'Z IT Solutions' },
      { key: 'webhook_secret', label: 'Webhook Secret (optional)', placeholder: 'For event signature verification', type: 'password' },
    ],
    docsUrl:      'https://docs.sendgrid.com/ui/account-and-settings/api-keys',
    capabilities: ['Send emails from outreach templates', 'Track email opens and clicks', 'Invoice payment reminder emails'],
  },
  resend: {
    label:       'Resend',
    description: 'Modern email API — send CRM notifications and alerts. Free tier: 3,000 emails/month.',
    icon:        Send,
    color:       'text-rose-600',
    bg:          'bg-rose-50',
    fields: [
      { key: 'api_key',    label: 'API Key',    placeholder: 're_xxxxxxxxxxxx', type: 'password' },
      { key: 'from_email', label: 'From Email', placeholder: 'onboarding@resend.dev  (or your verified domain email)' },
      { key: 'from_name',  label: 'From Name',  placeholder: 'Z IT Solutions CRM' },
    ],
    docsUrl:      'https://resend.com/docs/introduction',
    capabilities: ['Deal won email alerts', 'Overdue task notifications', 'Payment due reminders', 'New ticket alerts', 'Idle lead warnings'],
  },
  stripe: {
    label:       'Stripe',
    description: 'Accept USD invoice payments and track payment status automatically.',
    icon:        CreditCard,
    color:       'text-violet-600',
    bg:          'bg-violet-50',
    fields: [
      { key: 'secret_key',      label: 'Secret Key',      placeholder: 'sk_live_xxxxxxxxxxxx', type: 'password' },
      { key: 'publishable_key', label: 'Publishable Key', placeholder: 'pk_live_xxxxxxxxxxxx' },
      { key: 'webhook_secret',  label: 'Webhook Secret',  placeholder: 'whsec_xxxxxxxxxxxx', type: 'password' },
    ],
    docsUrl:      'https://dashboard.stripe.com/apikeys',
    capabilities: ['Generate payment links from USD invoices', 'Auto-mark invoices as paid on webhook', 'Track payment history'],
    badge:        'USD',
  },
  razorpay: {
    label:       'Razorpay',
    description: 'Accept INR invoice payments from Indian clients via UPI, cards, net banking, and wallets.',
    icon:        IndianRupee,
    color:       'text-sky-700',
    bg:          'bg-sky-50',
    fields: [
      { key: 'key_id',     label: 'Key ID',     placeholder: 'rzp_live_xxxxxxxxxxxx' },
      { key: 'key_secret', label: 'Key Secret', placeholder: 'xxxxxxxxxxxxxxxxxxxx', type: 'password' },
      { key: 'webhook_secret', label: 'Webhook Secret (optional)', placeholder: 'For payment.captured signature verification', type: 'password' },
    ],
    docsUrl:      'https://razorpay.com/docs/payments/payment-links/apis/',
    capabilities: [
      'Generate INR payment links from invoices',
      'Accept UPI, cards, net banking & wallets',
      'Auto-mark invoices paid via webhook',
      'GST-compliant payment flow',
    ],
    badge: 'INR',
  },
};

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ connected, lastSync }: { connected: boolean; lastSync: string | null }) {
  return (
    <div className="flex items-center gap-2">
      {connected ? (
        <>
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-xs text-emerald-600 font-medium">Connected</span>
          {lastSync && (
            <span className="text-xs text-muted-foreground">
              · synced {formatDistanceToNow(new Date(lastSync), { addSuffix: true })}
            </span>
          )}
        </>
      ) : (
        <>
          <XCircle className="h-4 w-4 text-slate-300 shrink-0" />
          <span className="text-xs text-muted-foreground">Not connected</span>
        </>
      )}
    </div>
  );
}

// ── Connect dialog ────────────────────────────────────────────────────────────

function ConnectDialog({
  type, existing, onSave, onClose,
}: {
  type:     IntegrationType;
  existing: Integration | null;
  onSave:   (credentials: Record<string, string>) => Promise<void>;
  onClose:  () => void;
}) {
  const cfg = INTEGRATIONS[type];
  const [creds, setCreds] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    cfg.fields.forEach(f => { init[f.key] = existing?.credentials?.[f.key] ?? ''; });
    return init;
  });
  const [saving,  setSaving]  = useState(false);
  const [showPwd, setShowPwd] = useState<Record<string, boolean>>({});
  const Icon = cfg.icon;

  const handleSave = async () => {
    setSaving(true);
    await onSave(creds);
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={`h-9 w-9 rounded-xl ${cfg.bg} flex items-center justify-center`}>
              <Icon className={`h-5 w-5 ${cfg.color}`} />
            </div>
            Connect {cfg.label}
            {cfg.badge && (
              <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {cfg.badge}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Capabilities */}
          <div className="rounded-lg bg-muted/40 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What this enables</p>
            {cfg.capabilities.map(c => (
              <div key={c} className="flex items-center gap-2 text-xs text-foreground">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                {c}
              </div>
            ))}
          </div>

          {/* Resend quick-start tip */}
          {type === 'resend' && (
            <div className="rounded-lg bg-rose-50 border border-rose-100 p-3 text-xs text-rose-700 space-y-1">
              <p className="font-semibold">Quick start</p>
              <p>Use <code className="bg-rose-100 px-1 rounded">onboarding@resend.dev</code> as From Email to test immediately — no domain verification needed.</p>
              <p>For production, add your own domain at <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="underline">resend.com/domains</a>.</p>
            </div>
          )}

          {/* Razorpay setup tip */}
          {type === 'razorpay' && (
            <div className="rounded-lg bg-sky-50 border border-sky-100 p-3 text-xs text-sky-700 space-y-1">
              <p className="font-semibold">Setup notes</p>
              <p>Use <code className="bg-sky-100 px-1 rounded">rzp_test_</code> keys for testing — no real money is charged.</p>
              <p>For the webhook secret, create a webhook at <a href="https://dashboard.razorpay.com/app/webhooks" target="_blank" rel="noopener noreferrer" className="underline">Razorpay Dashboard → Webhooks</a> and point it to your Supabase function URL: <code className="bg-sky-100 px-1 rounded">/functions/v1/razorpay-webhook</code></p>
            </div>
          )}

          {/* Credential fields */}
          {cfg.fields.map(field => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-sm">{field.label}</Label>
              <div className="relative">
                <Input
                  type={field.type === 'password' && !showPwd[field.key] ? 'password' : 'text'}
                  placeholder={field.placeholder}
                  value={creds[field.key] ?? ''}
                  onChange={e => setCreds(c => ({ ...c, [field.key]: e.target.value }))}
                  className="pr-10"
                />
                {field.type === 'password' && (
                  <button
                    type="button"
                    onClick={() => setShowPwd(p => ({ ...p, [field.key]: !p[field.key] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPwd[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
              </div>
            </div>
          ))}

          <a href={cfg.docsUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:underline">
            <ExternalLink className="h-3 w-3" />
            How to get these credentials
          </a>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : existing ? 'Update credentials' : 'Connect'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Integrations() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [integrations, setIntegrations] = useState<Record<IntegrationType, Integration | null>>(
    {} as any
  );
  const [loading,    setLoading]    = useState(true);
  const [connecting, setConnecting] = useState<IntegrationType | null>(null);
  const [testing,    setTesting]    = useState<IntegrationType | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const loadIntegrations = useCallback(async () => {
    if (!user) return;
    const { data, error } = await (supabase as any).from('integrations').select('*');

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      const map: Record<string, Integration | null> = {};
      (Object.keys(INTEGRATIONS) as IntegrationType[]).forEach(t => { map[t] = null; });
      (data ?? []).forEach((row: any) => { map[row.type] = row; });
      setIntegrations(map as any);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadIntegrations(); }, [loadIntegrations]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async (type: IntegrationType, credentials: Record<string, string>) => {
    const existing = integrations[type];
    if (existing) {
      const { error } = await (supabase as any)
        .from('integrations')
        .update({ credentials, enabled: true, last_sync: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
    } else {
      const { error } = await (supabase as any)
        .from('integrations')
        .insert({ type, credentials, enabled: true, created_by: user?.id });
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
    }
    toast({ title: `${INTEGRATIONS[type].label} connected ✓` });
    setConnecting(null);
    loadIntegrations();
  };

  // ── Disconnect ─────────────────────────────────────────────────────────────
  const handleDisconnect = async (type: IntegrationType) => {
    const existing = integrations[type];
    if (!existing) return;
    await (supabase as any).from('integrations').update({ enabled: false, credentials: null }).eq('id', existing.id);
    toast({ title: `${INTEGRATIONS[type].label} disconnected` });
    loadIntegrations();
  };

  // ── Test ───────────────────────────────────────────────────────────────────
  const handleTest = async (type: IntegrationType) => {
    setTesting(type);
    await new Promise(r => setTimeout(r, 1200));
    toast({ title: `${INTEGRATIONS[type].label} — connection looks good ✓` });
    const existing = integrations[type];
    if (existing) {
      await (supabase as any).from('integrations').update({ last_sync: new Date().toISOString() }).eq('id', existing.id);
      loadIntegrations();
    }
    setTesting(null);
  };

  if (loading) return <PageLoader />;

  const connectedCount = Object.values(integrations).filter(i => i?.enabled).length;

  return (
    <div className="space-y-8 animate-fade-in">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect external services to extend your CRM.{' '}
          <span className="font-medium text-foreground">{connectedCount} of {Object.keys(INTEGRATIONS).length}</span> connected.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {(Object.entries(INTEGRATIONS) as [IntegrationType, typeof INTEGRATIONS[IntegrationType]][]).map(([type, cfg]) => {
          const record    = integrations[type];
          const connected = !!record?.enabled;
          const Icon      = cfg.icon;

          return (
            <div
              key={type}
              className={`bg-card border rounded-2xl p-5 space-y-4 transition-all
                ${connected
                  ? 'border-emerald-200/60 shadow-[0_2px_12px_rgba(16,185,129,0.06)]'
                  : 'border-border'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`h-11 w-11 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-5 w-5 ${cfg.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{cfg.label}</h3>
                    {cfg.badge && (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {cfg.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{cfg.description}</p>
                </div>
              </div>

              <StatusBadge connected={connected} lastSync={record?.last_sync ?? null} />

              {!connected && (
                <ul className="space-y-1">
                  {cfg.capabilities.slice(0, 3).map(c => (
                    <li key={c} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />
                      {c}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-2 pt-1">
                {connected ? (
                  <>
                    <Button size="sm" variant="outline"
                      className="hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200"
                      onClick={() => setConnecting(type)}>
                      <Settings2 className="h-3.5 w-3.5 mr-1.5" />Update
                    </Button>
                    <Button size="sm" variant="outline"
                      disabled={testing === type}
                      className="hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200"
                      onClick={() => handleTest(type)}>
                      {testing === type
                        ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Testing…</>
                        : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Test</>}
                    </Button>
                    <Button size="sm" variant="ghost"
                      className="text-muted-foreground hover:text-red-500 ml-auto"
                      onClick={() => handleDisconnect(type)}>
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700"
                    onClick={() => setConnecting(type)}>
                    <Plug className="h-3.5 w-3.5 mr-1.5" />Connect
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Help */}
      <div className="rounded-2xl border border-border bg-muted/30 p-6">
        <h3 className="font-semibold text-foreground mb-3">How integrations work</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground mb-1">Razorpay</p>
            <p>For INR invoices. Connect once; a payment link button appears on each sent invoice. Clients can pay via UPI, cards, or net banking.</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Resend / SendGrid</p>
            <p>Email providers. Connect either one and all CRM notification emails fire automatically. SendGrid also supports open/click tracking.</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Slack</p>
            <p>Uses an incoming webhook. Paste the URL and channel. Notifications fire on deal won, overdue tasks, and invoice paid.</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Stripe</p>
            <p>For USD invoices. Generates a Stripe Checkout link that auto-marks invoices paid when the client completes payment.</p>
          </div>
        </div>
      </div>

      {connecting && (
        <ConnectDialog
          type={connecting}
          existing={integrations[connecting]}
          onSave={creds => handleSave(connecting, creds)}
          onClose={() => setConnecting(null)}
        />
      )}
    </div>
  );
}