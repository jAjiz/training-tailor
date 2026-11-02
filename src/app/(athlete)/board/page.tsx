import { redirect } from "next/navigation";
import { requireAthletePage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { programPageHref } from "@/lib/routes";
import { listAthletePrograms } from "@/lib/training/services/enrollments";

/** The Announcements tab before a program is picked: the board of the first program, as on the today page. */
export default async function BoardRedirectPage() {
  const athlete = await requireAthletePage();
  const [first] = await listAthletePrograms(prisma, athlete.id);
  redirect(first ? programPageHref("board", first.programId) : "/");
}
