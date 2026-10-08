import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { TrainingError } from "@/lib/training/errors";
import { getAthleteByUserId, getCoachByUserId } from "@/lib/training/services/accounts";

const withNext = (path: string, next?: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path);

/** Pages of the athlete zone: sign-in, then onboarding, then the page. */
export async function requireAthletePage(next?: string) {
  const user = await getSessionUser();
  if (!user) redirect(withNext("/signin", next));
  const athlete = await getAthleteByUserId(prisma, user.id);
  if (!athlete) redirect(withNext("/onboarding", next));
  return athlete;
}

/** Pages of the coach zone: sign-in, onboarding, approval, then the page. */
export async function requireCoachPage() {
  const user = await getSessionUser();
  if (!user) redirect("/coach/signin");
  const coach = await getCoachByUserId(prisma, user.id);
  if (!coach) redirect("/coach/onboarding");
  if (coach.status !== "approved") redirect("/coach/pending");
  return coach;
}

export async function requireAthlete() {
  const user = await getSessionUser();
  if (!user) throw new TrainingError("unauthorized");
  const athlete = await getAthleteByUserId(prisma, user.id);
  if (!athlete) throw new TrainingError("unauthorized");
  return athlete;
}

export async function requireCoach() {
  const user = await getSessionUser();
  if (!user) throw new TrainingError("unauthorized");
  const coach = await getCoachByUserId(prisma, user.id);
  if (!coach) throw new TrainingError("unauthorized");
  if (coach.status !== "approved") throw new TrainingError("coach_pending");
  return coach;
}
