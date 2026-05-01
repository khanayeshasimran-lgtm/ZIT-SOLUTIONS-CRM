/**
 * contexts/OrganizationContext.tsx
 *
 * Multi-tenant foundation.
 * Wraps the app with the current user's organization, plan, and usage counts.
 * All components that need tenant data import from here — never query
 * the organizations table directly in a component.
 *
 * USAGE:
 *   1. Wrap <App /> (inside AuthProvider) with <OrganizationProvider />
 *   2. Components: const { org, plan, usage, isAtLimit } = useOrganization();
 *   3. Gate features: if (isAtLimit('leads')) { show upgrade prompt }
 */

import {
  createContext, useContext, useEffect, useState, useCallback,
  type ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// ── Plan definitions ──────────────────────────────────────────────────────────
// These mirror what's stored in the organizations table.
// Limits of -1 = unlimited.

export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  max_users:    number;
  max_leads:    number;
  max_deals:    number;
  max_projects: number;
  max_invoices: number;
  can_export:   boolean;
  can_api:      boolean;
  can_portal:   boolean;
  can_analytics: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    max_users:     3,
    max_leads:     50,
    max_deals:     20,
    max_projects:  3,
    max_invoices:  5,
    can_export:    false,
    can_api:       false,
    can_portal:    false,
    can_analytics: false,
  },
  pro: {
    max_users:     20,
    max_leads:     1000,
    max_deals:     500,
    max_projects:  50,
    max_invoices:  200,
    can_export:    true,
    can_api:       true,
    can_portal:    true,
    can_analytics: true,
  },
  enterprise: {
    max_users:     -1,
    max_leads:     -1,
    max_deals:     -1,
    max_projects:  -1,
    max_invoices:  -1,
    can_export:    true,
    can_api:       true,
    can_portal:    true,
    can_analytics: true,
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Organization {
  id:         string;
  name:       string;
  slug:       string;
  plan:       PlanTier;
  max_users:  number;
  created_at: string;
}

export interface OrgUsage {
  users:    number;
  leads:    number;
  deals:    number;
  projects: number;
  invoices: number;
}

interface OrganizationContextValue {
  org:        Organization | null;
  plan:       PlanLimits;
  usage:      OrgUsage;
  loading:    boolean;
  /** Returns true if the org has hit the limit for a given resource */
  isAtLimit:  (resource: keyof OrgUsage) => boolean;
  /** Refresh org + usage (call after creating resources) */
  refresh:    () => Promise<void>;
  /** For admin: upgrade plan */
  upgradePlan: (tier: PlanTier) => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const OrganizationContext = createContext<OrganizationContextValue>({
  org:         null,
  plan:        PLAN_LIMITS.free,
  usage:       { users: 0, leads: 0, deals: 0, projects: 0, invoices: 0 },
  loading:     true,
  isAtLimit:   () => false,
  refresh:     async () => {},
  upgradePlan: async () => {},
});

export function useOrganization() {
  return useContext(OrganizationContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();

  const [org,     setOrg]     = useState<Organization | null>(null);
  const [usage,   setUsage]   = useState<OrgUsage>({ users: 0, leads: 0, deals: 0, projects: 0, invoices: 0 });
  const [loading, setLoading] = useState(true);

  const fetchOrg = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const orgId = (profile as any)?.organization_id;
    if (!orgId) { setLoading(false); return; }

    // Fetch org record
    const { data: orgData } = await (supabase as any)
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (orgData) setOrg(orgData as Organization);

    // Fetch usage counts in parallel
    const [
      { count: users },
      { count: leads },
      { count: deals },
      { count: projects },
      { count: invoices },
    ] = await Promise.all([
      (supabase as any).from('profiles').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      (supabase as any).from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      (supabase as any).from('deals').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      (supabase as any).from('projects').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      (supabase as any).from('invoices').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    ]);

    setUsage({
      users:    users    ?? 0,
      leads:    leads    ?? 0,
      deals:    deals    ?? 0,
      projects: projects ?? 0,
      invoices: invoices ?? 0,
    });

    setLoading(false);
  }, [user, profile]);

  useEffect(() => { fetchOrg(); }, [fetchOrg]);

  const plan = PLAN_LIMITS[(org?.plan ?? 'free') as PlanTier];

  const isAtLimit = useCallback((resource: keyof OrgUsage): boolean => {
    const limit = plan[`max_${resource}` as keyof PlanLimits] as number;
    if (limit === -1) return false; // unlimited
    return usage[resource] >= limit;
  }, [plan, usage]);

  const upgradePlan = useCallback(async (tier: PlanTier) => {
    if (!org) return;
    await (supabase as any).from('organizations').update({ plan: tier }).eq('id', org.id);
    await fetchOrg();
  }, [org, fetchOrg]);

  return (
    <OrganizationContext.Provider value={{
      org, plan, usage, loading,
      isAtLimit, refresh: fetchOrg, upgradePlan,
    }}>
      {children}
    </OrganizationContext.Provider>
  );
}