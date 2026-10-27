import { checkCandidateExpectations } from "@/lib/engine/library-expectations";
import { EnergySystem, LoadIntensity, Quality } from "@/lib/engine/types";
import { assessMovement } from "./assess";
import type { DomainLibrary } from "./library";
import { createMovementResolver, normalizeMovementName } from "./resolve";

export type FindingEntity =
  | "movement" | "contraindication" | "taxonomy" | "conversions" | "expectation" | "evalCase" | "reference";

export interface LibraryFinding {
  level: "error" | "warning";
  code: string;
  entity: FindingEntity;
  ref: string | null;
  message: string;
}

export const hasErrors = (findings: readonly LibraryFinding[]) => findings.some((f) => f.level === "error");

const FEW_AVAILABLE = 5;

const error = (code: string, entity: FindingEntity, ref: string | null, message: string): LibraryFinding =>
  ({ level: "error", code, entity, ref, message });
const warning = (code: string, entity: FindingEntity, ref: string | null, message: string): LibraryFinding =>
  ({ level: "warning", code, entity, ref, message });

function duplicateNames({ movements }: DomainLibrary): LibraryFinding[] {
  const owner = new Map<string, { index: number; name: string }>();
  const out: LibraryFinding[] = [];
  movements.forEach((m, index) => {
    for (const text of [m.name, ...m.aliases]) {
      const key = normalizeMovementName(text);
      const previous = owner.get(key);
      if (previous === undefined) {
        owner.set(key, { index, name: m.name });
      } else if (previous.index !== index) {
        out.push(error("duplicate_name", "movement", m.name, `"${text}" on "${m.name}" collides with "${previous.name}".`));
      }
    }
  });
  return out;
}

function unknownSubstitutes({ movements }: DomainLibrary): LibraryFinding[] {
  const resolve = createMovementResolver(movements);
  return movements.flatMap((m) =>
    m.substitutes.filter((s) => !resolve(s)).map((s) =>
      error("unknown_substitute", "movement", m.name, `"${m.name}" lists the unknown substitute "${s}".`)));
}

function unknownAvoidMovements({ movements, contraindications }: DomainLibrary): LibraryFinding[] {
  const names = new Set(movements.map((m) => m.name));
  return contraindications.flatMap((c) =>
    c.avoidMovements.filter((n) => !names.has(n)).map((n) =>
      error("unknown_avoid_movement", "contraindication", c.key, `"${c.key}" avoids the unknown movement "${n}".`)));
}

function unknownConversionMovements({ movements, conversions }: DomainLibrary): LibraryFinding[] {
  const names = new Set(movements.map((m) => m.name));
  return conversions.effort.flatMap((group) =>
    group.equivalents.filter((e) => !names.has(e.movement)).map((e) =>
      error("unknown_conversion_movement", "conversions", group.key,
        `Conversion "${group.key}" names the unknown movement "${e.movement}".`)));
}

function duplicateContraindications({ contraindications }: DomainLibrary): LibraryFinding[] {
  const seen = new Set<string>();
  const out: LibraryFinding[] = [];
  for (const c of contraindications) {
    if (seen.has(c.key)) out.push(error("duplicate_contraindication", "contraindication", c.key, `"${c.key}" is defined more than once.`));
    seen.add(c.key);
  }
  return out;
}

function taxonomyMismatches({ taxonomy }: DomainLibrary): LibraryFinding[] {
  const out: LibraryFinding[] = [];
  const check = (name: string, defs: { key: string }[], options: readonly string[]) => {
    const have = defs.map((d) => d.key).sort();
    const want = [...options].sort();
    if (have.length === want.length && have.every((k, i) => k === want[i])) return;
    const missing = want.filter((k) => !have.includes(k));
    const extra = have.filter((k) => !want.includes(k));
    const parts = [
      missing.length > 0 ? `missing ${missing.join(", ")}` : "",
      extra.length > 0 ? `unexpected ${extra.join(", ")}` : "",
      have.length !== new Set(have).size ? "duplicate keys" : "",
    ].filter(Boolean);
    out.push(error("taxonomy_mismatch", "taxonomy", name, `Taxonomy ${name}: ${parts.join("; ")}.`));
  };
  check("qualities", taxonomy.qualities, Quality.options);
  check("energySystems", taxonomy.energySystems, EnergySystem.options);
  check("loadIntensities", taxonomy.loadIntensities, LoadIntensity.options);
  return out;
}

function unblockedSites({ movements, contraindications }: DomainLibrary): LibraryFinding[] {
  const blocked = new Set(contraindications.flatMap((c) => c.rules.filter((r) => r.tier === "avoid").map((r) => r.site)));
  const sites = new Set(movements.flatMap((m) => m.stresses.map((s) => s.site)));
  return [...sites].filter((s) => !blocked.has(s)).map((s) =>
    error("unblocked_site", "reference", s, `No contraindication has an avoid rule for the stressed site "${s}".`));
}

const GRADED = [["flexion", "deep_flexion"], ["extension", "deep_extension"]] as const;

function gradedMechanismOverlaps({ movements }: DomainLibrary): LibraryFinding[] {
  return movements.flatMap((m) =>
    m.stresses.flatMap((s) =>
      GRADED.filter(([a, b]) => s.mechanisms.includes(a) && s.mechanisms.includes(b)).map(([a, b]) =>
        error("graded_mechanism_overlap", "movement", m.name, `"${m.name}" lists both ${a} and ${b} on ${s.site}.`))));
}

function sameElements(actual: readonly string[], expected: readonly string[]) {
  return actual.length === expected.length && actual.every((x, i) => x === expected[i]);
}

function expectationFindings(library: DomainLibrary): LibraryFinding[] {
  const { movements, contraindications } = library;
  const resolve = createMovementResolver(movements);
  const names = new Set(movements.map((m) => m.name));
  const out: LibraryFinding[] = [];

  const exactName = (ref: string, name: string) => {
    if (!names.has(name)) out.push(error("expectation_unknown_movement", "expectation", ref, `Expectation names the unknown movement "${name}".`));
  };
  const movement = (ref: string, name: string) => {
    const m = resolve(name);
    if (!m) out.push(error("expectation_unknown_movement", "expectation", ref, `Expectation names the unknown movement "${name}".`));
    return m;
  };
  const failed = (ref: string, message: string) => out.push(error("expectation_failed", "expectation", ref, message));

  for (const e of library.expectations) {
    switch (e.kind) {
      case "verdict": {
        const ref = `verdict:${e.contraindication}`;
        const c = contraindications.find((x) => x.key === e.contraindication);
        if (!c) {
          out.push(error("expectation_unknown_contraindication", "expectation", ref,
            `Expectation names the unknown contraindication "${e.contraindication}".`));
        }
        for (const name of e.movements) {
          const m = movement(ref, name);
          if (!m || !c) continue;
          const verdict = assessMovement(m, [{ contraindication: c, side: e.side, severity: e.severity }]).verdict;
          const holds = e.is === "not_avoid" ? verdict !== "avoid" : verdict === e.is;
          if (!holds) failed(ref, `"${m.name}" under "${c.key}" should be ${e.is} but is ${verdict}.`);
        }
        break;
      }
      case "substitutes": {
        const ref = `substitutes:${e.movement}`;
        const m = movement(ref, e.movement);
        for (const name of [...(e.startsWith ?? []), ...(e.includes ?? [])]) exactName(ref, name);
        if (!m) break;
        const start = e.startsWith ?? [];
        if (!sameElements(m.substitutes.slice(0, start.length), start)) {
          failed(ref, `Substitutes of "${m.name}" should start with ${start.join(", ")}.`);
        }
        for (const name of e.includes ?? []) {
          if (!m.substitutes.includes(name)) failed(ref, `Substitutes of "${m.name}" should include "${name}".`);
        }
        break;
      }
      case "stress": {
        const ref = `stress:${e.movement}`;
        const m = movement(ref, e.movement);
        if (!m) break;
        const present = m.stresses.some((s) =>
          s.site === e.site && (e.mechanism === undefined || s.mechanisms.includes(e.mechanism)));
        if (present !== e.present) {
          const what = e.mechanism ? `${e.site} ${e.mechanism}` : e.site;
          failed(ref, `"${m.name}" should ${e.present ? "have" : "not have"} a ${what} stress.`);
        }
        break;
      }
      case "field": {
        const ref = `field:${e.movement}`;
        const m = movement(ref, e.movement);
        if (!m) break;
        const actual: readonly string[] = m[e.field];
        if (e.equals !== undefined && !sameElements(actual, e.equals)) {
          failed(ref, `${e.field} of "${m.name}" should equal ${e.equals.join(", ")} but is ${actual.join(", ")}.`);
        }
        for (const v of e.includes ?? []) {
          if (!actual.includes(v)) failed(ref, `${e.field} of "${m.name}" should include "${v}".`);
        }
        break;
      }
      case "resolves": {
        const ref = `resolves:${e.movement}`;
        if (!movement(ref, e.movement)) break;
        const got = resolve(e.text);
        if (got?.name !== e.movement) {
          failed(ref, `"${e.text}" should resolve to "${e.movement}" but resolves to ${got ? `"${got.name}"` : "nothing"}.`);
        }
        break;
      }
      case "candidates":
        break;
    }
  }
  return out;
}

function duplicateEvalCases({ evalCases }: DomainLibrary): LibraryFinding[] {
  const seen = new Set<string>();
  const out: LibraryFinding[] = [];
  for (const c of evalCases) {
    if (seen.has(c.id)) out.push(error("duplicate_eval_case", "evalCase", c.id, `Eval case id "${c.id}" is used more than once.`));
    seen.add(c.id);
  }
  return out;
}

function noSubstitutes({ movements }: DomainLibrary): LibraryFinding[] {
  return movements.filter((m) => m.substitutes.length === 0).map((m) =>
    warning("no_substitutes", "movement", m.name, `"${m.name}" has no substitutes.`));
}

function fewAvailable({ movements, contraindications }: DomainLibrary): LibraryFinding[] {
  return contraindications.flatMap((c) => {
    const n = movements.filter((m) =>
      assessMovement(m, [{ contraindication: c, side: null, severity: "moderate" }]).verdict !== "avoid").length;
    return n < FEW_AVAILABLE
      ? [warning("few_available", "contraindication", c.key, `Only ${n} movements remain available under "${c.key}".`)]
      : [];
  });
}

function hangingWithoutGrip({ movements }: DomainLibrary): LibraryFinding[] {
  return movements.filter((m) => m.positions.includes("hanging") && !m.stresses.some((s) => s.site === "grip")).map((m) =>
    warning("hanging_without_grip", "movement", m.name, `"${m.name}" hangs but has no grip stress.`));
}

export function validateLibrary(library: DomainLibrary): LibraryFinding[] {
  return [
    ...duplicateNames(library),
    ...unknownSubstitutes(library),
    ...unknownAvoidMovements(library),
    ...unknownConversionMovements(library),
    ...duplicateContraindications(library),
    ...taxonomyMismatches(library),
    ...unblockedSites(library),
    ...gradedMechanismOverlaps(library),
    ...expectationFindings(library),
    ...checkCandidateExpectations(library),
    ...duplicateEvalCases(library),
    ...noSubstitutes(library),
    ...fewAvailable(library),
    ...hangingWithoutGrip(library),
  ];
}
