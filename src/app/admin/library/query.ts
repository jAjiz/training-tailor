import { z } from "zod";

const Query = z.string().trim().min(1).max(100);

/** The `q` search of an entry page; anything unexpected is ignored. */
export function parseQuery(sp: Record<string, string | string[] | undefined>): string | undefined {
  const parsed = Query.safeParse(Array.isArray(sp.q) ? sp.q[0] : sp.q);
  return parsed.success ? parsed.data : undefined;
}
