import { getDomainData } from "@/lib/domain/repository";
import { isLiftMovement } from "../barbell";
import { TrainingError } from "../errors";
import type { DbOrTx } from "./types";

export async function assertLiftMovement(db: DbOrTx, name: string): Promise<void> {
  const { movements } = await getDomainData(db);
  if (!isLiftMovement(name, movements)) throw new TrainingError("invalid_request");
}
