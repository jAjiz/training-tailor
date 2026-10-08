import { getDomainData } from "@/lib/domain/repository";
import { isLiftMovement } from "../barbell";
import { TrainingError } from "../errors";

export async function assertLiftMovement(name: string): Promise<void> {
  const { movements } = await getDomainData();
  if (!isLiftMovement(name, movements)) throw new TrainingError("invalid_request");
}
