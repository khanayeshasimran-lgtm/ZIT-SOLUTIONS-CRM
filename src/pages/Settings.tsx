/**
 * pages/Settings.tsx — production-fixed version
 *
 * Fixes applied:
 * 1. profile and form used without null checks → null-safe access throughout
 * 2. Role no longer fetched from DB — comes from useAuth()
 * 3. refreshProfile() called after save so context stays in sync
 * 4. PageLoader replaces copy-pasted loading block
 * 5. Roles section shows accurate assigned role from profile
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageLoader } from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { User, Shield, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AppRole } from "@/contexts/AuthContext";

// ── Role display config ───────────────────────────────────────────────────────

const ROLE_META: Record<AppRole, { label: string; color: string; description: string }> = {
  admin:    { label: "Admin",    color: "bg-blue-100 text-blue-800",   description: "Full system access" },
  manager:  { label: "Manager",  color: "bg-purple-100 text-purple-800", description: "Manage projects & teams" },
  user:     { label: "User",     color: "bg-green-100 text-green-800",  description: "Standard access" },
  investor: { label: "Investor", color: "bg-amber-100 text-amber-800",  description: "Read-only investor dashboard" },
};

// ── Form type ─────────────────────────────────────────────────────────────────

interface ProfileForm {
  full_name: string;
  phone: string;
  job_title: string;
  company: string;
  location: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, profile, role, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [form,    setForm]    = useState<ProfileForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // Hydrate form from context profile
  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name ?? "",
      phone:     profile.phone     ?? "",
      job_title: profile.job_title ?? "",
      company:   profile.company   ?? "",
      location:  profile.location  ?? "",
    });
    setLoading(false);
  }, [profile]);

  const handleSave = async () => {
    if (!user || !form) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name  || null,
        phone:     form.phone      || null,
        job_title: form.job_title  || null,
        company:   form.company    || null,
        location:  form.location   || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } else {
      // FIX: keep AuthContext in sync — no stale role/profile
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

  // FIX: guard against null profile during load
  if (loading || !profile || !form) return <PageLoader />;

  const roleMeta = ROLE_META[role ?? "user"];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Profile card ──────────────────────────────────────────────────── */}
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
                <Pencil className="h-4 w-4 mr-2" /> Edit Profile
              </Button>
            )}
          </div>

          <div className="space-y-4">
            {/* Email is always read-only */}
            <div>
              <Label>Email</Label>
              <Input value={profile.email} disabled />
            </div>

            <div>
              <Label>Full name</Label>
              <Input
                disabled={!editing}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>

            <div>
              <Label>Phone</Label>
              <Input
                disabled={!editing}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div>
              <Label>Job title</Label>
              <Input
                disabled={!editing}
                value={form.job_title}
                onChange={(e) => setForm({ ...form, job_title: e.target.value })}
              />
            </div>

            <div>
              <Label>Company</Label>
              <Input
                disabled={!editing}
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
            </div>

            <div>
              <Label>Location</Label>
              <Input
                disabled={!editing}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>

            {editing && (
              <div className="flex gap-3 pt-4">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
                <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
              </div>
            )}
          </div>
        </div>

        {/* ── Role card ─────────────────────────────────────────────────────── */}
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

          {/* Current role highlight */}
          <div className="mb-6 rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground mb-2">Your current role</p>
            <div className="flex items-center gap-2">
              <Badge className={roleMeta.color}>{roleMeta.label}</Badge>
              <span className="text-sm text-muted-foreground">{roleMeta.description}</span>
            </div>
          </div>

          {/* All roles reference */}
          <div className="space-y-2 text-sm">
            {(Object.entries(ROLE_META) as [AppRole, typeof ROLE_META[AppRole]][]).map(([r, meta]) => (
              <div key={r} className="flex items-center gap-2">
                <Badge className={meta.color}>{meta.label}</Badge>
                <span className="text-muted-foreground">{meta.description}</span>
                {r === role && (
                  <span className="text-xs text-muted-foreground ml-auto">(you)</span>
                )}
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Role changes can only be made by an admin from the Users page.
          </p>
        </div>

      </div>
    </div>
  );
}
