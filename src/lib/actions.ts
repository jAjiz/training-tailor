import { notFound, unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionContext, type SessionContext } from "@/lib/session";
import { TrainingError, type ActionResult } from "@/lib/training/errors";
import { writeAudit } from "@/lib/training/services/audit";

/** After a successful action during an impersonation, records who really did it. Never fails the action. */
async function auditImpersonation(name: string, session: SessionContext & { impersonatedBy: string }): Promise<void> {
  try {
    await writeAudit(prisma, {
      actorUserId: session.impersonatedBy,
      action: name,
      targetUserId: session.user.id,
      targetType: "user",
      targetLabel: session.user.email,
      impersonating: true,
    });
  } catch (e) {
    console.error("[action] audit write failed", e);
  }
}

/**
 * Runs a Server Action body: refusals become codes, anything else is logged and becomes `internal`. `name` is the exported action's name, used for the audit row.
 * The session is read once, before the body, and handed to it: a read afterwards would carry the old cookie after an impersonation starts or stops,
 * and Better Auth would clear or re-set the cookie the action just wrote.
 */
export async function runAction<T>(name: string, fn: (session: SessionContext | null) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const session = await getSessionContext();
    const value = await fn(session);
    if (session?.impersonatedBy) await auditImpersonation(name, { ...session, impersonatedBy: session.impersonatedBy });
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
