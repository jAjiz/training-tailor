import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function getSessionUser(): Promise<{ id: string; name: string; email: string } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
}

export async function getUserId(): Promise<string | null> {
  return (await getSessionUser())?.id ?? null;
}
