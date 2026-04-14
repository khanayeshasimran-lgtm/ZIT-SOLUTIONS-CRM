/**
 * components/MobileCard.tsx
 *
 * Generic mobile card used on every list page.
 * Replaces the identical copy-pasted card pattern across
 * Leads, Contacts, Companies, Activities, Projects,
 * Tickets, Interns, Templates, OutreachTasks.
 *
 * Usage:
 *   <MobileCard
 *     title="John Doe"
 *     badge={<Badge>New</Badge>}
 *     details={[
 *       { label: "Email", value: "john@example.com" },
 *       { label: "Phone", value: "+1 555-0100" },
 *     ]}
 *     actions={<Button size="sm">Edit</Button>}
 *   />
 */

import type { ReactNode } from "react";

interface DetailRow {
  label: string;
  value: ReactNode;
}

interface MobileCardProps {
  title: ReactNode;
  badge?: ReactNode;
  details: DetailRow[];
  actions?: ReactNode;
}

export function MobileCard({ title, badge, details, actions }: MobileCardProps) {
  return (
    <div className="rounded-lg border p-4 space-y-3 bg-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="text-base font-semibold break-words">{title}</div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>

      {/* Detail rows */}
      <div className="text-sm space-y-1 text-muted-foreground">
        {details.map(({ label, value }, i) => (
          <div key={i}>
            <span className="font-medium text-foreground">{label}:</span>{" "}
            {value ?? "—"}
          </div>
        ))}
      </div>

      {/* Actions */}
      {actions && (
        <div className="pt-2 border-t flex items-center gap-2 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}