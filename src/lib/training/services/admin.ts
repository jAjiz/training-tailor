import type { Db } from "./types";

export async function grantAdmin(db: Db, email: string): Promise<"granted" | "not_found"> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return "not_found";
  await db.user.update({ where: { id: user.id }, data: { role: "admin" } });
  return "granted";
}
