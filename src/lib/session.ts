import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type SessionUser = { id: string; name: string; email: string; image: string | null };

export async function getSessionContext(): Promise<{
  user: SessionUser;
  role: string | null;
  impersonatedBy: string | null;
} | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return {
    user: { id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image ?? null },
    role: session.user.role ?? null,
    impersonatedBy: session.session.impersonatedBy ?? null,
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  return (await getSessionContext())?.user ?? null;
}

export async function getUserId(): Promise<string | null> {
  return (await getSessionUser())?.id ?? null;
}
