/**
 * components/PlanUsageBar.tsx
 *
 * Shows current usage vs plan limits for a given resource.
 * Drop this anywhere — Dashboard header, Settings, sidebar footer.
 *
 * USAGE:
 *   <PlanUsageBar resource="leads" label="Leads" />
 *   <PlanUsageBar resource="users" label="Team members" />
 */

import { useOrganization, PLAN_LIMITS, type PlanTier } from '@/contexts/OrganizationContext';
import type { OrgUsage } from '@/contexts/OrganizationContext';

interface PlanUsageBarProps {
  resource: keyof OrgUsage;
  label:    string;
  compact?: boolean;
}

export function PlanUsageBar({ resource, label, compact = false }: PlanUsageBarProps) {
  const { org, plan, usage } = useOrganization();
  if (!org) return null;

  const limit   = plan[`max_${resource}` as keyof typeof plan] as number;
  const current = usage[resource];

  if (limit === -1) return null; // unlimited — don't show bar

  const pct      = Math.min(Math.round((current / limit) * 100), 100);
  const isWarn   = pct >= 80;
  const isCrit   = pct >= 95;
  const planName = (org.plan.charAt(0).toUpperCase() + org.plan.slice(1)) as string;

  if (compact) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">{label}</span>
          <span className={isCrit ? 'text-red-500 font-bold' : isWarn ? 'text-amber-500 font-semibold' : 'text-muted-foreground'}>
            {current}/{limit}
          </span>
        </div>
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isCrit ? 'bg-red-500' : isWarn ? 'bg-amber-400' : 'bg-indigo-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-sm tabular-nums ${isCrit ? 'text-red-600 font-bold' : isWarn ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>
            {current} / {limit}
          </span>
          {isCrit && (
            <span className="text-xs bg-red-50 text-red-600 ring-1 ring-red-200 rounded-full px-2 py-0.5 font-semibold">
              Limit reached
            </span>
          )}
          {isWarn && !isCrit && (
            <span className="text-xs bg-amber-50 text-amber-600 ring-1 ring-amber-200 rounded-full px-2 py-0.5 font-semibold">
              {100 - pct}% left
            </span>
          )}
        </div>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isCrit ? 'bg-red-500' : isWarn ? 'bg-amber-400' : 'bg-indigo-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isCrit && (
        <p className="text-xs text-muted-foreground">
          Upgrade from {planName} to add more{' '}
          <a href="/settings/billing" className="text-indigo-600 hover:underline font-medium">Upgrade plan →</a>
        </p>
      )}
    </div>
  );
}