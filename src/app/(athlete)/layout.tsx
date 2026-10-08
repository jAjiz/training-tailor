import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getAthleteByUserId } from "@/lib/training/services/accounts";
import { AthleteNav } from "./AthleteNav";

export default async function AthleteLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const athlete = user ? await getAthleteByUserId(prisma, user.id) : null;
  return (
    <>
      <main className="mx-auto max-w-md px-4 pb-24 pt-4">{children}</main>
      {athlete && <AthleteNav />}
    </>
  );
}
