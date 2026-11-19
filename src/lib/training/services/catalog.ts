import { getDomainData } from "@/lib/domain/repository";
import { isLiftMovement } from "../barbell";
import { TrainingError } from "../errors";
import { recordKindOf, type RecordKind } from "../records";
import type { DbOrTx } from "./types";

export async function assertLiftMovement(db: DbOrTx, name: string): Promise<void> {
  const { movements } = await getDomainData(db);
  if (!isLiftMovement(name, movements)) throw new TrainingError("invalid_request");
}

/** A record's kind must be the one the published library gives its movement. */
export async function assertRecordKind(db: DbOrTx, name: string, kind: RecordKind): Promise<void> {
  const { movements } = await getDomainData(db);
  if (recordKindOf(name, movements) !== kind) throw new TrainingError("invalid_request");
}
