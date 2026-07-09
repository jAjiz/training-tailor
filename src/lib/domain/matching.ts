import type { InjuryContraindication, Movement } from "./types";

// A movement is contraindicated if it is listed explicitly, if it requires an
// avoided body position, or if any of its site stresses matches an avoided
// rule on both site and at least one mechanism.
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
