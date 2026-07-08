import type { InjuryContraindication, Movement } from "./types";

// A movement is contraindicated if it is listed explicitly, or if any of its
// site stresses matches an avoided rule on both site and at least one mechanism.
export function matchesContraindication(
  movement: Movement,
  contraindication: InjuryContraindication
): boolean {
  if (contraindication.avoidMovements.includes(movement.name)) return true;
  return movement.stresses.some((stress) =>
    contraindication.avoidStresses.some(
      (rule) =>
        rule.site === stress.site &&
        rule.mechanisms.some((m) => stress.mechanisms.includes(m))
    )
  );
}
