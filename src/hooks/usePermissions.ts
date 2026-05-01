/**
 * hooks/usePermissions.ts
 *
 * Centralised permission checks. Replaces the scattered
 * `const canManage = role === 'admin' || role === 'manager'`
 * pattern that exists in every page today.
 *
 * PHASE 1 (now):
 *   Falls back to role-based logic — works immediately,
 *   no DB changes required.
 *
 * PHASE 4 (Step 11):
 *   When the `permissions` table is created, this hook will
 *   fetch per-role, per-module overrides from the DB.
 *   Components don't change at all — the hook handles it internally.
 *
 * Usage:
 *   const { canView, canCreate, canEdit, canDelete } = usePermissions('leads');
 *   const { isAdmin, isManager, isUser, isInvestor } = usePermissions();
 */

import { useAuth } from '@/contexts/AuthContext';

export type AppModule =
  | 'leads'
  | 'pipeline'
  | 'contacts'
  | 'companies'
  | 'activities'
  | 'meetings'
  | 'templates'
  | 'outreach_tasks'
  | 'projects'
  | 'tickets'
  | 'interns'
  | 'analytics'
  | 'users'
  | 'audit_logs'
  | 'investor_config'
  | 'time_tracking'
  | 'invoices'
  | 'integrations';

interface Permissions {
  // Role shortcuts
  isAdmin:    boolean;
  isManager:  boolean;
  isUser:     boolean;
  isInvestor: boolean;

  // CRUD permissions for the requested module
  canView:   boolean;
  canCreate: boolean;
  canEdit:   boolean;
  canDelete: boolean;

  // Convenience — true for admin + manager
  canManage: boolean;

  // Export — currently admin-only
  canExport: boolean;
}

// ── Default permission matrix (role-based fallback) ───────────────────────────

const MATRIX: Record<string, Record<AppModule, Pick<Permissions, 'canView' | 'canCreate' | 'canEdit' | 'canDelete'>>> = {
  admin: {
    leads:           { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    pipeline:        { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    contacts:        { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    companies:       { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    activities:      { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    meetings:        { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    templates:       { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    outreach_tasks:  { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    projects:        { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    tickets:         { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    interns:         { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    analytics:       { canView: true,  canCreate: false, canEdit: false, canDelete: false },
    users:           { canView: true,  canCreate: false, canEdit: true,  canDelete: false },
    audit_logs:      { canView: true,  canCreate: false, canEdit: false, canDelete: false },
    investor_config: { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    time_tracking:   { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    invoices:        { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    integrations:    { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
  },
  manager: {
    leads:           { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    pipeline:        { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    contacts:        { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    companies:       { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    activities:      { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    meetings:        { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    templates:       { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    outreach_tasks:  { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    projects:        { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    tickets:         { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    interns:         { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    analytics:       { canView: true,  canCreate: false, canEdit: false, canDelete: false },
    users:           { canView: false, canCreate: false, canEdit: false, canDelete: false },
    audit_logs:      { canView: false, canCreate: false, canEdit: false, canDelete: false },
    investor_config: { canView: false, canCreate: false, canEdit: false, canDelete: false },
    time_tracking:   { canView: true,  canCreate: true,  canEdit: true,  canDelete: true  },
    invoices:        { canView: true,  canCreate: true,  canEdit: true,  canDelete: false },
    integrations:    { canView: false, canCreate: false, canEdit: false, canDelete: false },
  },
  user: {
    leads:           { canView: true,  canCreate: true,  canEdit: false, canDelete: false },
    pipeline:        { canView: true,  canCreate: false, canEdit: false, canDelete: false },
    contacts:        { canView: true,  canCreate: true,  canEdit: false, canDelete: false },
    companies:       { canView: true,  canCreate: true,  canEdit: false, canDelete: false },
    activities:      { canView: true,  canCreate: true,  canEdit: false, canDelete: false },
    meetings:        { canView: true,  canCreate: false, canEdit: false, canDelete: false },
    templates:       { canView: true,  canCreate: false, canEdit: false, canDelete: false },
    outreach_tasks:  { canView: true,  canCreate: true,  canEdit: false, canDelete: false },
    projects:        { canView: true,  canCreate: false, canEdit: false, canDelete: false },
    tickets:         { canView: true,  canCreate: true,  canEdit: false, canDelete: false },
    interns:         { canView: true,  canCreate: false, canEdit: false, canDelete: false },
    analytics:       { canView: true,  canCreate: false, canEdit: false, canDelete: false },
    users:           { canView: false, canCreate: false, canEdit: false, canDelete: false },
    audit_logs:      { canView: false, canCreate: false, canEdit: false, canDelete: false },
    investor_config: { canView: false, canCreate: false, canEdit: false, canDelete: false },
    time_tracking:   { canView: true,  canCreate: true,  canEdit: false, canDelete: false },
    invoices:        { canView: true,  canCreate: false, canEdit: false, canDelete: false },
    integrations:    { canView: false, canCreate: false, canEdit: false, canDelete: false },
  },
  investor: {
    leads:           { canView: false, canCreate: false, canEdit: false, canDelete: false },
    pipeline:        { canView: true,  canCreate: false, canEdit: false, canDelete: false },
    contacts:        { canView: false, canCreate: false, canEdit: false, canDelete: false },
    companies:       { canView: false, canCreate: false, canEdit: false, canDelete: false },
    activities:      { canView: false, canCreate: false, canEdit: false, canDelete: false },
    meetings:        { canView: false, canCreate: false, canEdit: false, canDelete: false },
    templates:       { canView: false, canCreate: false, canEdit: false, canDelete: false },
    outreach_tasks:  { canView: false, canCreate: false, canEdit: false, canDelete: false },
    projects:        { canView: false, canCreate: false, canEdit: false, canDelete: false },
    tickets:         { canView: false, canCreate: false, canEdit: false, canDelete: false },
    interns:         { canView: false, canCreate: false, canEdit: false, canDelete: false },
    analytics:       { canView: true,  canCreate: false, canEdit: false, canDelete: false },
    users:           { canView: false, canCreate: false, canEdit: false, canDelete: false },
    audit_logs:      { canView: false, canCreate: false, canEdit: false, canDelete: false },
    investor_config: { canView: false, canCreate: false, canEdit: false, canDelete: false },
    time_tracking:   { canView: false, canCreate: false, canEdit: false, canDelete: false },
    invoices:        { canView: false, canCreate: false, canEdit: false, canDelete: false },
    integrations:    { canView: false, canCreate: false, canEdit: false, canDelete: false },
  },
};

export function usePermissions(module?: AppModule): Permissions {
  const { role } = useAuth();
  const r = role ?? 'user';

  const isAdmin    = r === 'admin';
  const isManager  = r === 'manager';
  const isUser     = r === 'user';
  const isInvestor = r === 'investor';
  const canManage  = isAdmin || isManager;
  const canExport  = isAdmin;

  if (!module) {
    return {
      isAdmin, isManager, isUser, isInvestor,
      canManage, canExport,
      canView: true, canCreate: canManage,
      canEdit: canManage, canDelete: isAdmin,
    };
  }

  const modulePerms = MATRIX[r]?.[module] ?? {
    canView: false, canCreate: false, canEdit: false, canDelete: false,
  };

  return {
    isAdmin, isManager, isUser, isInvestor,
    canManage,
    canExport,
    ...modulePerms,
  };
}