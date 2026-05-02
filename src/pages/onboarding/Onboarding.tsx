/**
 * src/pages/onboarding/Onboarding.tsx
 *
 * FIXES IN THIS VERSION:
 *
 *   FIX 1 — Create org now goes through the `create-organization` Edge Function.
 *     Direct client INSERT into `organizations` was blocked by RLS (the error
 *     "new row violates row-level security policy for table organizations").
 *     The edge function uses the service role key which bypasses RLS correctly.
 *     It also handles the profile link atomically with rollback on failure.
 *
 *   FIX 2 — `?code=` pre-fill extracts just the slug even if a full URL is pasted.
 *     `useSearchParams().get('code')` already returns just the slug from the URL.
 *     Additionally, if someone manually pastes a full URL into the code field,
 *     the `extractCode()` helper strips the URL and keeps only the code value.
 *
 *   FIX 3 — Tab and code pre-fill derived synchronously before first render.
 *     Previously used useEffect to set mode/inviteCode after mount, causing a
 *     flash of the Create tab even when ?code= was present. Now initialMode and
 *     initialCode are derived from searchParams before useState initializes.
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { callEdgeFunction } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Building2, User, CheckCircle2, ArrowRight, Loader2, Zap,
  PlusCircle, LogIn,
} from 'lucide-react';
import { z } from 'zod';

// ── Validation ────────────────────────────────────────────────────────────────

const step1CreateSchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(100).trim(),
});

const step1JoinSchema = z.object({
  inviteCode: z.string().min(3, 'Invite code is too short').trim(),
});

const step2Schema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100).trim(),
  jobTitle: z.string().min(2, 'Job title must be at least 2 characters').max(100).trim(),
});

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { number: 1, label: 'Your company',  icon: Building2    },
  { number: 2, label: 'Your profile',  icon: User         },
  { number: 3, label: 'All set!',      icon: CheckCircle2 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * FIX 2: Strip a full URL down to just the code slug.
 * Handles: full URL, path?code=x, or plain slug — returns just the slug.
 */
function extractCode(raw: string): string {
  const trimmed = raw.trim();
  try {
    if (trimmed.includes('://')) {
      const url = new URL(trimmed);
      return url.searchParams.get('code') ?? trimmed;
    }
    if (trimmed.includes('?code=')) {
      return trimmed.split('?code=')[1].split('&')[0];
    }
  } catch {
    // Not a URL — fall through
  }
  return trimmed;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // FIX 3: derive synchronously — no useEffect needed
  const initialCode = extractCode(searchParams.get('code') ?? '');
  const initialMode: 'create' | 'join' = initialCode ? 'join' : 'create';

  const [step,   setStep]   = useState(1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [mode, setMode] = useState<'create' | 'join'>(initialMode);

  // Step 1 fields
  const [companyName, setCompanyName] = useState('');
  const [inviteCode,  setInviteCode]  = useState(initialCode); // pre-filled from URL

  // Step 2 fields
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');

  // Resolved after step 1 validation (join path)
  const [resolvedOrgId,   setResolvedOrgId]   = useState('');
  const [resolvedOrgName, setResolvedOrgName] = useState('');

  // ── Step 1 ─────────────────────────────────────────────────────────────────

  const handleStep1 = async () => {
    if (mode === 'create') {
      const result = step1CreateSchema.safeParse({ companyName });
      if (!result.success) {
        const errs: Record<string, string> = {};
        result.error.errors.forEach(e => { errs[String(e.path[0])] = e.message; });
        setErrors(errs);
        return;
      }
      setResolvedOrgName(companyName.trim());
      setErrors({});
      setStep(2);

    } else {
      // FIX 2: always extract in case user typed/pasted a full URL
      const cleanCode = extractCode(inviteCode);
      if (cleanCode !== inviteCode) setInviteCode(cleanCode);

      const result = step1JoinSchema.safeParse({ inviteCode: cleanCode });
      if (!result.success) {
        const errs: Record<string, string> = {};
        result.error.errors.forEach(e => { errs[String(e.path[0])] = e.message; });
        setErrors(errs);
        return;
      }

      setSaving(true);
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('slug', cleanCode.toLowerCase())
        .single();
      setSaving(false);

      if (orgError || !org) {
        setErrors({
          inviteCode:
            'Invite code not found. Ask your admin — they can copy the link from Admin → Users.',
        });
        return;
      }

      setResolvedOrgId((org as any).id);
      setResolvedOrgName((org as any).name ?? cleanCode);
      setErrors({});
      setStep(2);
    }
  };

  // ── Step 2 ─────────────────────────────────────────────────────────────────

  const handleStep2 = async () => {
    if (!user) return;

    const result = step2Schema.safeParse({ fullName, jobTitle });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.errors.forEach(e => { errs[String(e.path[0])] = e.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    setSaving(true);

    try {
      let orgId: string;

      if (mode === 'create') {
        // FIX 1: go through edge function — direct INSERT blocked by RLS
        const res = await callEdgeFunction<{ success: boolean; orgId?: string; error?: string }>(
          'create-organization',
          { companyName: companyName.trim() },
        );
        if (!res.success || !res.orgId) {
          throw new Error(res.error ?? 'Failed to create organization');
        }
        orgId = res.orgId;
        // Edge function already set organization_id on the profile, but we
        // include it below too (idempotent, and ensures full_name + job_title
        // are written in the same update call).

      } else {
        if (!resolvedOrgId) {
          throw new Error('Invite code was not validated. Please go back and re-enter it.');
        }
        orgId = resolvedOrgId;
      }

      // Write profile info (organization_id is idempotent for create, required for join)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          organization_id: orgId,
          full_name:       fullName.trim(),
          job_title:       jobTitle.trim(),
          updated_at:      new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileError) throw new Error(profileError.message);

      await refreshProfile();
      setStep(3);

    } catch (err: any) {
      toast({
        variant:     'destructive',
        title:       'Setup failed',
        description: err.message ?? 'Something went wrong. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = () => navigate('/dashboard', { replace: true });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative w-full max-w-lg">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="text-white font-bold text-xl">Z IT Solutions CRM</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => {
            const Icon      = s.icon;
            const isDone    = step > s.number;
            const isCurrent = step === s.number;
            return (
              <div key={s.number} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  isDone    ? 'bg-emerald-500/20 text-emerald-400'
                : isCurrent ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40'
                :              'bg-white/5 text-white/30'
                }`}>
                  <Icon className="h-3.5 w-3.5" />
                  {s.label}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-px w-6 ${step > s.number ? 'bg-emerald-500/40' : 'bg-white/10'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-8 shadow-2xl">

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white">Set up your workspace</h2>
                <p className="text-white/50 mt-1 text-sm">
                  Create a new organization or join an existing one with an invite code.
                </p>
              </div>

              {/* Mode tabs */}
              <div className="flex rounded-xl bg-white/[0.06] p-1 gap-1">
                <button
                  onClick={() => { setMode('create'); setErrors({}); }}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                    mode === 'create' ? 'bg-indigo-600 text-white shadow' : 'text-white/50 hover:text-white/70'
                  }`}
                >
                  <PlusCircle className="h-4 w-4" />Create org
                </button>
                <button
                  onClick={() => { setMode('join'); setErrors({}); }}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                    mode === 'join' ? 'bg-indigo-600 text-white shadow' : 'text-white/50 hover:text-white/70'
                  }`}
                >
                  <LogIn className="h-4 w-4" />Join with code
                </button>
              </div>

              {/* Create fields */}
              {mode === 'create' && (
                <div className="space-y-2">
                  <Label className="text-white/70 text-sm">Organization name *</Label>
                  <Input
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void handleStep1(); }}
                    placeholder="e.g. Z IT Solutions"
                    className="bg-white/[0.06] border-white/[0.12] text-white placeholder-white/25 h-11 focus:border-indigo-500/60"
                  />
                  {errors.companyName && <p className="text-xs text-red-400">{errors.companyName}</p>}
                  <p className="text-xs text-white/30 pt-1">
                    This creates your <strong className="text-white/40">organization</strong> — your CRM workspace.
                    Staff join via the invite link in Admin → Users.
                    Clients are added separately by an admin.
                  </p>
                </div>
              )}

              {/* Join fields */}
              {mode === 'join' && (
                <div className="space-y-2">
                  <Label className="text-white/70 text-sm">Invite code *</Label>
                  <Input
                    value={inviteCode}
                    onChange={e => setInviteCode(extractCode(e.target.value))}
                    onKeyDown={e => { if (e.key === 'Enter') void handleStep1(); }}
                    placeholder="e.g. z-it-solutions-ab3cd"
                    className="bg-white/[0.06] border-white/[0.12] text-white placeholder-white/25 h-11 focus:border-indigo-500/60 font-mono"
                  />
                  {errors.inviteCode && <p className="text-xs text-red-400">{errors.inviteCode}</p>}
                  <p className="text-xs text-white/30 pt-1">
                    If you received an invite link it's pre-filled automatically.
                    Otherwise, ask your admin to copy it from Admin → Users.
                  </p>
                </div>
              )}

              <Button
                onClick={() => { void handleStep1(); }}
                disabled={saving}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking…</>
                ) : (
                  <>Continue <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </Button>
            </div>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white">Tell us about yourself</h2>
                <p className="text-white/50 mt-1 text-sm">
                  {mode === 'join'
                    ? <>Joining <span className="text-white/80 font-medium">{resolvedOrgName}</span>. This will be shown to your team.</>
                    : <>Setting up <span className="text-white/80 font-medium">{resolvedOrgName}</span>. This will be shown to your team.</>
                  }
                </p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white/70 text-sm">Full name *</Label>
                  <Input
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="e.g. Ayesha Simran"
                    className="bg-white/[0.06] border-white/[0.12] text-white placeholder-white/25 h-11 focus:border-indigo-500/60"
                  />
                  {errors.fullName && <p className="text-xs text-red-400">{errors.fullName}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70 text-sm">Job title *</Label>
                  <Input
                    value={jobTitle}
                    onChange={e => setJobTitle(e.target.value)}
                    placeholder="e.g. CEO, Sales Manager, Developer"
                    className="bg-white/[0.06] border-white/[0.12] text-white placeholder-white/25 h-11 focus:border-indigo-500/60"
                  />
                  {errors.jobTitle && <p className="text-xs text-red-400">{errors.jobTitle}</p>}
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setStep(1); setErrors({}); }}
                  disabled={saving}
                  className="flex-1 h-11 border-white/10 text-white/60 hover:text-white hover:bg-white/[0.05]"
                >
                  Back
                </Button>
                <Button
                  onClick={() => { void handleStep2(); }}
                  disabled={saving}
                  className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  {saving ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Setting up…</>
                  ) : (
                    <>Finish setup <ArrowRight className="h-4 w-4 ml-2" /></>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">You're all set!</h2>
                <p className="text-white/50 mt-2 text-sm">
                  {mode === 'create' ? (
                    <><span className="text-white/80 font-medium">{resolvedOrgName}</span> has been created. Your CRM workspace is ready.</>
                  ) : (
                    <>You've joined <span className="text-white/80 font-medium">{resolvedOrgName}</span>. Welcome to the team!</>
                  )}
                </p>
              </div>
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 text-left space-y-2">
                <p className="text-xs text-white/40 uppercase tracking-wide font-semibold">What's next</p>
                {[
                  'Add your first lead from the Leads page',
                  'Create a deal in the Pipeline board',
                  'Invite team members from Admin → Users',
                ].map(tip => (
                  <div key={tip} className="flex items-start gap-2 text-sm text-white/60">
                    <ArrowRight className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    {tip}
                  </div>
                ))}
              </div>
              <Button
                onClick={handleFinish}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
              >
                Go to Dashboard <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

        </div>

        <p className="text-center text-white/20 text-xs mt-6">
          Z IT Solutions CRM · Secure workspace setup
        </p>
      </div>
    </div>
  );
}