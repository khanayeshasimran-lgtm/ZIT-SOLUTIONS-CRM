/**
 * pages/Settings.tsx
 *
 * CHANGES IN THIS VERSION:
 *   - Added 'client' to ROLE_META so Settings renders correctly when the
 *     logged-in user has role='client' (previously caused a lookup miss and
 *     displayed nothing in the role card).
 *   - Note: clients should normally only use /portal, but if they ever reach
 *     /settings this won't crash anymore.
 *   - All other logic unchanged (notification prefs, profile edit, etc.)
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageLoader } from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { User, Shield, Pencil, Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AppRole } from "@/contexts/AuthContext";

// ── Role display config ───────────────────────────────────────────────────────

const ROLE_META: Record<AppRole, { label: string; color: string; description: string }> = {
  admin:    { label: "Admin",    color: "bg-blue-100 text-blue-800",     description: "Full system access"              },
  manager:  { label: "Manager",  color: "bg-purple-100 text-purple-800", description: "Manage projects & teams"         },
  user:     { label: "User",     color: "bg-green-100 text-green-800",   description: "Standard access"                 },
  investor: { label: "Investor", color: "bg-amber-100 text-amber-800",   description: "Read-only investor dashboard"    },
  // FIX: 'client' added — was missing, caused a blank role card for client accounts
  client:   { label: "Client",   color: "bg-teal-100 text-teal-800",     description: "Client portal access only"       },
};

// ── Notification preference types ─────────────────────────────────────────────

interface NotifPrefs {
  deal_won:      { inApp: boolean; email: boolean };
  overdue_task:  { inApp: boolean; email: boolean };
  payment_due:   { inApp: boolean; email: boolean };
  idle_lead:     { inApp: boolean; email: boolean };
  new_ticket:    { inApp: boolean; email: boolean };
}

const DEFAULT_PREFS: NotifPrefs = {
  deal_won:      { inApp: true,  email: true  },
  overdue_task:  { inApp: true,  email: false },
  payment_due:   { inApp: true,  email: true  },
  idle_lead:     { inApp: true,  email: false },
  new_ticket:    { inApp: true,  email: false },
};

const NOTIF_LABELS: Record<keyof NotifPrefs, string> = {
  deal_won:     "Deal won",
  overdue_task: "Overdue task",
  payment_due:  "Invoice payment due",
  idle_lead:    "Idle lead (3+ days)",
  new_ticket:   "New support ticket",
};

// ── Toggle component ──────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      title={label}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200
        ${checked ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transform ring-0 transition duration-200
        ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  );
}

// ── Profile form type ─────────────────────────────────────────────────────────

interface ProfileForm {
  full_name: string;
  phone:     string;
  job_title: string;
  company:   string;
  location:  string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, profile, role, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [form,      setForm]      = useState<ProfileForm | null>(null);
  const [editing,   setEditing]   = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);

  // ── Hydrate from profile ────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name ?? "",
      phone:     profile.phone     ?? "",
      job_title: profile.job_title ?? "",
      company:   profile.company   ?? "",
      location:  profile.location  ?? "",
    });
    if ((profile as any).notification_prefs) {
      try {
        const saved = JSON.parse((profile as any).notification_prefs);
        setNotifPrefs({ ...DEFAULT_PREFS, ...saved });
      } catch {}
    }
    setLoading(false);
  }, [profile]);

  // ── Save profile ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user || !form) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name:  form.full_name  || null,
        phone:      form.phone      || null,
        job_title:  form.job_title  || null,
        company:    form.company    || null,
        location:   form.location   || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } else {
      await refreshProfile();
      setEditing(false);
      toast({ title: "Saved", description: "Profile updated successfully" });
    }
    setSaving(false);
  };

  const cancelEdit = () => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        phone:     profile.phone     ?? "",
        job_title: profile.job_title ?? "",
        company:   profile.company   ?? "",
        location:  profile.location  ?? "",
      });
    }
    setEditing(false);
  };

  // ── Save notification preferences ──────────────────────────────────────────
  const handleSaveNotif = async () => {
    if (!user) return;
    setSavingNotif(true);
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ notification_prefs: JSON.stringify(notifPrefs) })
      .eq("id", user.id);

    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } else {
      toast({ title: "Notification preferences saved" });
    }
    setSavingNotif(false);
  };

  // ── Toggle a single notif channel ─────────────────────────────────────────
  const toggleNotif = (event: keyof NotifPrefs, channel: 'inApp' | 'email') => {
    setNotifPrefs(prev => ({
      ...prev,
      [event]: { ...prev[event], [channel]: !prev[event][channel] },
    }));
  };

  if (loading || !profile || !form) return <PageLoader />;

  // FIX: fallback to 'user' if role is somehow undefined rather than crashing
  const resolvedRole: AppRole = (role && role in ROLE_META) ? role : 'user';
  const roleMeta = ROLE_META[resolvedRole];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Profile card ── */}
        <div className="bg-card border rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-3 items-center">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Profile</h2>
                <p className="text-sm text-muted-foreground">Personal information</p>
              </div>
            </div>
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" />Edit Profile
              </Button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input value={profile.email} disabled />
            </div>
            <div>
              <Label>Full name</Label>
              <Input disabled={!editing} value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input disabled={!editing} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Job title</Label>
              <Input disabled={!editing} value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} />
            </div>
            <div>
              <Label>Company</Label>
              <Input disabled={!editing} value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <Label>Location</Label>
              <Input disabled={!editing} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
            </div>
            {editing && (
              <div className="flex gap-3 pt-4">
                <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
                <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
              </div>
            )}
          </div>
        </div>

        {/* ── Role card ── */}
        <div className="bg-card border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Roles & Permissions</h2>
              <p className="text-sm text-muted-foreground">Your access level</p>
            </div>
          </div>

          <div className="mb-6 rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground mb-2">Your current role</p>
            <div className="flex items-center gap-2">
              <Badge className={roleMeta.color}>{roleMeta.label}</Badge>
              <span className="text-sm text-muted-foreground">{roleMeta.description}</span>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            {(Object.entries(ROLE_META) as [AppRole, typeof ROLE_META[AppRole]][]).map(([r, meta]) => (
              <div key={r} className="flex items-center gap-2">
                <Badge className={meta.color}>{meta.label}</Badge>
                <span className="text-muted-foreground">{meta.description}</span>
                {r === resolvedRole && <span className="text-xs text-muted-foreground ml-auto">(you)</span>}
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Role changes can only be made by an admin from the Users page.
          </p>
        </div>
      </div>

      {/* ── Notification preferences ── */}
      <div className="bg-card border rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-3 items-center">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Notification Preferences</h2>
              <p className="text-sm text-muted-foreground">Choose how you want to be notified</p>
            </div>
          </div>
          <Button size="sm" onClick={handleSaveNotif} disabled={savingNotif}>
            {savingNotif ? "Saving…" : "Save preferences"}
          </Button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-3 gap-4 mb-3 px-1">
          <span className="text-xs font-semibold text-muted-foreground">Event</span>
          <span className="text-xs font-semibold text-muted-foreground text-center">In-app</span>
          <span className="text-xs font-semibold text-muted-foreground text-center">Email</span>
        </div>

        <div className="space-y-1 divide-y divide-border">
          {(Object.keys(notifPrefs) as (keyof NotifPrefs)[]).map(event => (
            <div key={event} className="grid grid-cols-3 gap-4 items-center py-3 px-1">
              <span className="text-sm text-foreground">{NOTIF_LABELS[event]}</span>
              <div className="flex justify-center">
                <Toggle
                  checked={notifPrefs[event].inApp}
                  onChange={() => toggleNotif(event, 'inApp')}
                  label={`Toggle in-app notification for ${NOTIF_LABELS[event]}`}
                />
              </div>
              <div className="flex justify-center">
                <Toggle
                  checked={notifPrefs[event].email}
                  onChange={() => toggleNotif(event, 'email')}
                  label={`Toggle email notification for ${NOTIF_LABELS[event]}`}
                />
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Email notifications require SendGrid to be connected in Admin → Integrations.
          In-app notifications appear as toast alerts while you're using the app.
        </p>
      </div>
    </div>
  );
}