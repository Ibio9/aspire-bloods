import { prisma } from '../db/client.js';

interface AuditLogInput {
  actorUserId?: string | null;
  actorType?: 'USER' | 'SYSTEM';
  action: string;
  targetType: string;
  targetId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

/** Insert-only audit trail. Never update or delete rows in this table. */
export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLogEntry.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType ?? 'USER',
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      ipAddress: input.ipAddress ?? null,
      metadata: input.metadata as any,
    },
  });
}
