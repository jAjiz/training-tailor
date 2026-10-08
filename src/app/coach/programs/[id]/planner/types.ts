import type { LiftGroup } from "@/lib/training/barbell";
import type { BarbellSet } from "@/lib/training/schemas";

export type PlannerBlockData = {
  id: string;
  dayIndex: number;
  position: number;
  kind: "custom" | "barbell";
  title: string | null;
  color: string;
  coachingTips: string | null;
  videoUrl: string | null;
  description: string | null;
  scoring: string | null;
  timeCapSeconds: number | null;
  movement: string | null;
  sets: BarbellSet[] | null;
  instructions: string | null;
  resultCount: number;
};

export type PlannerContext = {
  programId: string;
  lifts: LiftGroup[];
  readOnly: boolean;
  /** Last week index the coach can target (closed programs), or null when unbounded. */
  maxWeek: number | null;
  weekIndex: number;
};
