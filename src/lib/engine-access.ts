import { jsonError } from "@/lib/http";
import { getSessionContext } from "@/lib/session";

/** Engine routes (/api/tailor/*, /api/profile): a session is required, and an impersonation session never acts. */
export async function engineUserId(): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, response: jsonError("unauthorized", 401) };
  if (ctx.impersonatedBy) return { ok: false, response: jsonError("forbidden", 403) };
  return { ok: true, userId: ctx.user.id };
}
