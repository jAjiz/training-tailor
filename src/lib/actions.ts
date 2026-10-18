import { notFound, unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { TrainingError, type ActionResult } from "@/lib/training/errors";
import { writeAudit } from "@/lib/training/services/audit";

/** After a successful action during an impersonation, records who really did it. Never fails the action. */
async function auditImpersonation(name: string): Promise<void> {
  try {
    const ctx = await getSessionContext();
    if (!ctx?.impersonatedBy) return;
    await writeAudit(prisma, {
      actorUserId: ctx.impersonatedBy,
      action: name,
      targetUserId: ctx.user.id,
      impersonating: true,
    });
  } catch (e) {
    console.error("[action] audit write failed", e);
  }
}

/** Runs a Server Action body: refusals become codes, anything else is logged and becomes `internal`. `name` is the exported action's name, used for the audit row. */
export async function runAction<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    await auditImpersonation(name);
    return { ok: true, value };
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    if (e instanceof TrainingError) return { ok: false, code: e.code };
    console.error("[action] failed", e);
    return { ok: false, code: "internal" };
  }
}

/** For pages: a service's `not_found` becomes the 404 page. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof TrainingError && e.code === "not_found") notFound();
    throw e;
  }
}
