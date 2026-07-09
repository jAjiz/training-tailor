import type { InjuryContraindication, Movement } from "./types";

export function matchesContraindication(
  movement: Movement,
  contraindication: InjuryContraindication
): boolean {
  if (contraindication.avoidMovements.includes(movement.name)) return true;
  if (movement.positions.some((p) => contraindication.avoidPositions.includes(p))) return true;
  return movement.stresses.some((stress) =>
    contraindication.avoidStresses.some(
      (rule) =>
        rule.site === stress.site &&
        rule.mechanisms.some((m) => stress.mechanisms.includes(m))
    )
  );
}
