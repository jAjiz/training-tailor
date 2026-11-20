import { getDomainData } from "@/lib/domain/repository";
import { isLiftMovement } from "../barbell";
import { TrainingError } from "../errors";
import { findRecordEntry, recordFits } from "../records";
import type { PrInputValue } from "../schemas";
import type { DbOrTx } from "./types";

export async function assertLiftMovement(db: DbOrTx, name: string): Promise<void> {
  const { movements } = await getDomainData(db);
  if (!isLiftMovement(name, movements)) throw new TrainingError("invalid_request");
}

/** A record must fit its movement's entry in the published records catalog. */
export async function assertRecordFits(db: DbOrTx, input: PrInputValue): Promise<void> {
  const { records } = await getDomainData(db);
  if (!recordFits(findRecordEntry(records, input.movement), recordFieldsOf(input))) throw new TrainingError("invalid_request");
}

/** A new record's stored columns, null where its kind has none. */
export function recordFieldsOf(input: PrInputValue) {
  const none = { kg: null, reps: null, distanceM: null, calories: null, seconds: null };
  switch (input.kind) {
    case "lift": return { ...none, kind: input.kind, kg: input.kg, reps: input.reps };
    case "reps": return { ...none, kind: input.kind, kg: input.kg, reps: input.reps };
    case "distance": return { ...none, kind: input.kind, distanceM: input.distanceM };
    case "time": return { ...none, kind: input.kind, seconds: input.seconds, distanceM: input.distanceM ?? null, calories: input.calories ?? null };
  }
}
