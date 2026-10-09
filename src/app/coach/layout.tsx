import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getCoachByUserId } from "@/lib/training/services/accounts";
import { CoachNav } from "./CoachNav";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const coach = user ? await getCoachByUserId(prisma, user.id) : null;
  return (
    <>
      <CoachNav user={user && { name: user.name, image: user.image }} approved={coach?.status === "approved"} />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </>
  );
}
