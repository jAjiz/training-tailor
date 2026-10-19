import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { getSessionContext } from "@/lib/session";

/** True when the user's athlete profile is disabled: the engine refuses them like every athlete action. */
export async function isEngineDisabled(userId: string): Promise<boolean> {
  const athlete = await prisma.athleteAccount.findUnique({ where: { userId }, select: { disabledAt: true } });
  return Boolean(athlete?.disabledAt);
}

/**
 * Engine routes (/api/tailor/*, /api/profile): a session is required, an impersonation session never acts,
 * and a disabled athlete is refused.
 */
export async function engineUserId(): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, response: jsonError("unauthorized", 401) };
  if (ctx.impersonatedBy) return { ok: false, response: jsonError("forbidden", 403) };
  if (await isEngineDisabled(ctx.user.id)) return { ok: false, response: jsonError("account_disabled", 403) };
  return { ok: true, userId: ctx.user.id };
}
