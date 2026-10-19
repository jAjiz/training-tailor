import type { AdminAuditLog } from "@/generated/prisma/client";
import type { Db, DbOrTx } from "./types";

export type AuditEntry = {
  actorUserId: string | null;
  action: string;
  targetUserId?: string | null;
  targetType?: "coach" | "athlete" | "program" | "user";
  targetId?: string | null;
  targetLabel?: string | null;
  impersonating?: boolean;
  details?: Record<string, string | number | boolean>;
};

const PAGE_SIZE = 50;

export async function writeAudit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.adminAuditLog.create({ data: entry });
}

/** Newest first, 50 per page. */
export async function listAudit(
  db: Db,
  filter: { targetUserId?: string; action?: string; page: number },
): Promise<{ rows: AdminAuditLog[]; hasMore: boolean }> {
  const found = await db.adminAuditLog.findMany({
    where: { targetUserId: filter.targetUserId, action: filter.action },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: filter.page * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });
  return { rows: found.slice(0, PAGE_SIZE), hasMore: found.length > PAGE_SIZE };
}
