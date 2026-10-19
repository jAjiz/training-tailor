import { notFound, redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { getSessionContext, getSessionUser } from "@/lib/session";
import { TrainingError } from "@/lib/training/errors";
import { getAthleteByUserId, getCoachByUserId } from "@/lib/training/services/accounts";

const withNext = (path: string, next?: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path);

/** Pages of the athlete zone: sign-in, then onboarding, then the page. */
export async function requireAthletePage(next?: string) {
  const user = await getSessionUser();
  if (!user) redirect(withNext("/signin", next));
  const athlete = await getAthleteByUserId(prisma, user.id);
  if (!athlete) redirect(withNext("/onboarding", next));
  if (athlete.disabledAt) redirect("/disabled");
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
  if (athlete.disabledAt) throw new TrainingError("account_disabled");
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

/** Pages of the admin zone: no session goes to sign-in, anyone who is not an admin gets a 404. */
export async function requireAdminPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/admin/signin");
  if (!isAdminSession(ctx)) notFound();
  return ctx.user;
}

/** Admin Server Actions: anyone who is not an admin is told "not found". */
export async function requireAdmin() {
  const ctx = await getSessionContext();
  if (!ctx || !isAdminSession(ctx)) throw new TrainingError("not_found");
  return ctx.user;
}
