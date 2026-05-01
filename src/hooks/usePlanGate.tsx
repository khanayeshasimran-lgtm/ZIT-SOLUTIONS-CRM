/**
 * hooks/usePlanGate.ts
 *
 * Gate any feature behind a plan tier.
 * Returns { allowed, reason, UpgradePrompt } so components can either
 * block the action entirely or render an inline upgrade nudge.
 *
 * USAGE:
 *
 *   const { allowed, UpgradePrompt } = usePlanGate('can_export');
 *   if (!allowed) return <UpgradePrompt />;
 *
 *   // Or for count-based limits:
 *   const { allowed } = usePlanGate('leads');
 *   <Button disabled={!allowed} onClick={...}>Add Lead</Button>
 */

import { useOrganization, type PlanTier, PLAN_LIMITS } from '@/contexts/OrganizationContext';
import type { OrgUsage } from '@/contexts/OrganizationContext';

type BooleanFeature = 'can_export' | 'can_api' | 'can_portal' | 'can_analytics';
type CountFeature   = keyof OrgUsage;
type GateFeature    = BooleanFeature | CountFeature;

interface PlanGateResult {
  allowed:       boolean;
  reason:        string | null;
  currentPlan:   PlanTier;
  /** Inline JSX upgrade card — render when !allowed */
  UpgradePrompt: () => JSX.Element;
}

const PLAN_NAMES: Record<PlanTier, string> = {
  free:       'Free',
  pro:        'Pro',
  enterprise: 'Enterprise',
};

const UPGRADE_TO: Record<PlanTier, PlanTier | null> = {
  free:       'pro',
  pro:        'enterprise',
  enterprise: null,
};

export function usePlanGate(feature: GateFeature): PlanGateResult {
  const { org, plan, usage, isAtLimit } = useOrganization();

  const currentPlan = (org?.plan ?? 'free') as PlanTier;
  const nextPlan    = UPGRADE_TO[currentPlan];

  let allowed = true;
  let reason: string | null = null;

  if (feature.startsWith('can_')) {
    // Boolean feature gate
    allowed = plan[feature as BooleanFeature] as boolean;
    if (!allowed) {
      reason = `${feature.replace('can_', '').replace('_', ' ')} requires the ${nextPlan ? PLAN_NAMES[nextPlan] : 'Pro'} plan`;
    }
  } else {
    // Count-based gate
    const limited = isAtLimit(feature as CountFeature);
    if (limited) {
      allowed = false;
      const limit = plan[`max_${feature}` as keyof typeof plan] as number;
      reason = `You've reached your ${feature} limit (${limit}) on the ${PLAN_NAMES[currentPlan]} plan`;
    }
  }

  const UpgradePrompt = (): JSX.Element => {
    if (allowed) return <></>;
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 flex items-start gap-3">
        <span className="text-2xl shrink-0">⚡</span>
        <div>
          <p className="text-sm font-semibold text-amber-800">Upgrade required</p>
          <p className="text-xs text-amber-700 mt-0.5">{reason}</p>
          {nextPlan && (
            <a
              href="/settings/billing"
              className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-900"
            >
              Upgrade to {PLAN_NAMES[nextPlan]} →
            </a>
          )}
        </div>
      </div>
    );
  };

  return { allowed, reason, currentPlan, UpgradePrompt };
}