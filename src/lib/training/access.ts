import { fromDbDate, type Timeline } from "./dates";

export type ProgramTiming = { kind: string; startDate: Date | null; weeks: number | null; publishedAt: Date | null };

/** The athlete's calendar for a program: continuous anchors on the program, closed on the enrollment. */
export function athleteTimeline(
  program: ProgramTiming, enrollment: { startDate: Date | null }, publishedWeeks: ReadonlySet<number>,
): Timeline {
  if (program.kind === "continuous" && program.startDate) {
    return { kind: "continuous", startDate: fromDbDate(program.startDate), publishedWeeks };
  }
  if (program.kind === "closed" && program.weeks && enrollment.startDate) {
    return { kind: "closed", startDate: fromDbDate(enrollment.startDate), weeks: program.weeks, published: program.publishedAt !== null };
  }
  throw new Error(`inconsistent program timing (${program.kind})`);
}

export function hasLeaderboard(block: { kind: string; scoring: string | null }, program: { kind: string }): boolean {
  return program.kind === "continuous" && block.kind === "custom" && block.scoring !== null && block.scoring !== "none";
}
