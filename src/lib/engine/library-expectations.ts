import type { ActiveCondition } from "@/lib/domain/assess";
import type { DomainLibrary } from "@/lib/domain/library";
import { createMovementResolver } from "@/lib/domain/resolve";
import type { LibraryFinding } from "@/lib/domain/validate-library";
import { rankCandidates, type PlanContext } from "./plan";

export function checkCandidateExpectations(library: DomainLibrary): LibraryFinding[] {
  const { movements, contraindications } = library;
  const resolve = createMovementResolver(movements);
  const findings: LibraryFinding[] = [];
  for (const e of library.expectations) {
    if (e.kind !== "candidates") continue;
    const ref = `candidates:${e.movement}`;
    const movement = resolve(e.movement);
    if (!movement) {
      findings.push({
        level: "error", code: "expectation_unknown_movement", entity: "expectation", ref,
        message: `Candidates expectation names an unknown movement "${e.movement}".`,
      });
      continue;
    }
    const listed = [...(e.first === undefined ? [] : [e.first]), ...(e.includes ?? []), ...(e.excludes ?? [])];
    const unknown = listed.filter((name) => !movements.some((m) => m.name === name));
    for (const name of unknown) {
      findings.push({
        level: "error", code: "expectation_unknown_movement", entity: "expectation", ref,
        message: `Candidates expectation for "${e.movement}" names an unknown movement "${name}".`,
      });
    }
    const active: ActiveCondition[] = [];
    for (const condition of e.conditions) {
      const contraindication = contraindications.find((c) => c.key === condition.key);
      if (!contraindication) {
        findings.push({
          level: "error", code: "expectation_unknown_contraindication", entity: "expectation", ref,
          message: `Candidates expectation for "${e.movement}" names an unknown contraindication "${condition.key}".`,
        });
        continue;
      }
      active.push({ contraindication, side: condition.side, severity: condition.severity });
    }
    if (active.length !== e.conditions.length || unknown.length > 0) continue;

    const ctx: PlanContext = { movements, resolve, active, equipment: e.equipment };
    const names = rankCandidates(movement, ctx).map((c) => c.name);
    const fail = (message: string) =>
      findings.push({ level: "error", code: "expectation_failed", entity: "expectation", ref, message });
    if (e.first !== undefined && names[0] !== e.first) {
      fail(`Candidates for "${e.movement}" should lead with "${e.first}" but lead with "${names[0] ?? "nothing"}".`);
    }
    for (const name of e.includes ?? []) {
      if (!names.includes(name)) fail(`Candidates for "${e.movement}" should include "${name}".`);
    }
    for (const name of e.excludes ?? []) {
      if (names.includes(name)) fail(`Candidates for "${e.movement}" should not include "${name}".`);
    }
  }
  return findings;
}
