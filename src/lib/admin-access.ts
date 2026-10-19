/** Only a real admin session counts: an impersonation session is never admin. */
export function isAdminSession(ctx: { role: string | null; impersonatedBy: string | null } | null): boolean {
  return ctx !== null && ctx.role === "admin" && ctx.impersonatedBy === null;
}
