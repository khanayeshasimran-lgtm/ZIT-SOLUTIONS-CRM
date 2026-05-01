/**
 * src/pages/onboarding/Onboarding.tsx
 *
 * DAY 1 FIX: Complete onboarding implementation.
 *
 * THE BUG THIS FIXES:
 *   ProtectedRoutes in App.tsx redirects any user with no organization_id
 *   to /onboarding. If Onboarding.tsx never writes organization_id back to
 *   the user's profile, the user is permanently stuck in a redirect loop:
 *     /dashboard → /onboarding → /dashboard → /onboarding → ...
 *
 * WHAT THIS FILE DOES:
 *   Step 1: Collect company name
 *   Step 2: Collect user's role/job title
 *   Step 3: Writes a new row to the `organizations` table
 *           and updates the user's profile with organization_id
 *   On completion: navigates to /dashboard — redirect loop resolved
 *
 * DATABASE REQUIREMENTS (run in Supabase SQL editor if not already done):
 *   - organizations table: id, name, slug, plan, max_users, created_at (no industry column)
 *   - profiles.organization_id: uuid FK → organizations.id
 *   Both are referenced in the existing codebase (OrganizationContext, RLS policies)
 *   so they should already exist.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Building2, User, CheckCircle2, ArrowRight, Loader2, Zap } from 'lucide-react';
import { z } from 'zod';

// ── Validation ────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(100).trim(),
});

const step2Schema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100).trim(),
  jobTitle: z.string().min(2, 'Job title must be at least 2 characters').max(100).trim(),
});

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { number: 1, label: 'Your company',  icon: Building2 },
  { number: 2, label: 'Your profile',  icon: User },
  { number: 3, label: 'All set!',      icon: CheckCircle2 },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step,    setStep]    = useState(1);
  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState<Record<string, string>>({});

  // Step 1 fields
  const [companyName, setCompanyName] = useState('');

  // Step 2 fields
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');

  // ── Step 1 submit ──────────────────────────────────────────────────────────
  const handleStep1 = () => {
    const result = step1Schema.safeParse({ companyName });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.errors.forEach(e => { errs[e.path[0]] = e.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    setStep(2);
  };

  // ── Step 2 submit — writes to DB ───────────────────────────────────────────
  const handleStep2 = async () => {
    if (!user) return;

    const result = step2Schema.safeParse({ fullName, jobTitle });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.errors.forEach(e => { errs[e.path[0]] = e.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    setSaving(true);

    try {
      // 1. Create the organization
      // Schema (generated types): id, name, slug, plan, max_users, created_at
      // No 'industry' column — slug must be unique, append random suffix
      const slug = companyName.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        + '-' + Math.random().toString(36).slice(2, 7);

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: companyName.trim(),
          slug,
          plan: 'starter',
        })
        .select('id')
        .single();

      if (orgError || !org) {
        throw new Error(orgError?.message ?? 'Failed to create organization');
      }

      // 2. Update the user's profile with organization_id + name + job title
      //    THIS IS THE CRITICAL WRITE that resolves the redirect loop in
      //    ProtectedRoutes — once organization_id is set, the guard passes.
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          organization_id: org.id,
          full_name:       fullName.trim(),
          job_title:       jobTitle.trim(),
          updated_at:      new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileError) {
        throw new Error(profileError.message);
      }

      // 3. Refresh the profile in AuthContext so the redirect guard re-evaluates
      await refreshProfile();

      setStep(3);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Setup failed',
        description: err.message ?? 'Something went wrong. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Step 3: go to dashboard ────────────────────────────────────────────────
  const handleFinish = () => navigate('/dashboard', { replace: true });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
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
            const Icon = s.icon;
            const isDone    = step > s.number;
            const isCurrent = step === s.number;
            return (
              <div key={s.number} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  isDone    ? 'bg-emerald-500/20 text-emerald-400' :
                  isCurrent ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40' :
                              'bg-white/5 text-white/30'
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

          {/* ── STEP 1: Company ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white">Set up your company</h2>
                <p className="text-white/50 mt-1 text-sm">This creates your workspace. Team members will join this organization.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white/70 text-sm">Company name *</Label>
                  <Input
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="e.g. Z IT Solutions"
                    className="bg-white/[0.06] border-white/[0.12] text-white placeholder-white/25 h-11 focus:border-indigo-500/60"
                  />
                  {errors.companyName && <p className="text-xs text-red-400">{errors.companyName}</p>}
                </div>

              </div>
              <Button onClick={handleStep1} className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {/* ── STEP 2: Profile ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white">Tell us about yourself</h2>
                <p className="text-white/50 mt-1 text-sm">This will be shown to your team members.</p>
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
                  onClick={() => setStep(1)}
                  disabled={saving}
                  className="flex-1 h-11 border-white/10 text-white/60 hover:text-white hover:bg-white/[0.05]"
                >
                  Back
                </Button>
                <Button
                  onClick={handleStep2}
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

          {/* ── STEP 3: Done ── */}
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
                  <span className="text-white/80 font-medium">{companyName}</span> is ready.
                  Your CRM workspace has been created.
                </p>
              </div>
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 text-left space-y-2">
                <p className="text-xs text-white/40 uppercase tracking-wide font-semibold">What's next</p>
                {['Add your first lead from the Leads page', 'Create a deal in the Pipeline board', 'Invite team members from Admin → Users'].map(tip => (
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
          Z IT Solutions CRM · Confidential workspace setup
        </p>
      </div>
    </div>
  );
}