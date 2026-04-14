 import { supabase } from '@/integrations/supabase/client';

type AuditParams = {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
};

export async function logAudit({
  userId,
  userEmail,
  action,
  entity,
  entityId,
}: AuditParams) {
  await (supabase as any)
    .from('audit_logs')
    .insert([
      {
        user_id: userId ?? null,
        user_email: userEmail ?? null,
        action,
        entity,
        entity_id: entityId ?? null,
      },
    ]);
}

export async function logRoleChange({
  adminId,
  adminEmail,
  targetUserId,
  oldRole,
  newRole,
}: {
  adminId: string;
  adminEmail: string;
  targetUserId: string;
  oldRole: string;
  newRole: string;
}) {
  await logAudit({
    userId: adminId,
    userEmail: adminEmail,
    action: 'CHANGE_ROLE',
    entity: 'user',
    entityId: `${oldRole} → ${newRole} (${targetUserId})`,
  });
}