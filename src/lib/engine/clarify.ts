import type { ActiveCondition } from "@/lib/domain/assess";
import { createMovementResolver, type MovementResolver } from "@/lib/domain/resolve";
import { StressMechanism, type Equipment, type Movement, type Site } from "@/lib/domain/types";
import { hasScope, restrictionConditions, restrictionKey } from "./conditions";
import { planComponents } from "./plan";
import type { ClarifyQuestion, Restriction, StructuredWorkout } from "./types";

// Plain words for the athlete, who never sees the mechanism names.
export const MECHANISM_TEXT: Record<StressMechanism, string> = {
  compression: "heavy loading",
  flexion: "bending",
  deep_flexion: "deep bending",
  extension: "holding it extended under load",
  deep_extension: "full extension",
  overhead: "arms overhead",
  ballistic: "explosive",
  impact: "impact (jumping, landing)",
  traction: "hanging from a bar",
  kipping: "kipping",
  eccentric: "lowering under load",
};

export type SiteOption = Extract<ClarifyQuestion, { kind: "site" }>["options"][number];

export type ClarifyAnswer =
  | { kind: "site"; restriction: number; mechanisms: StressMechanism[] | "all" | "none" }
  | { kind: "replacement"; restriction: number; blockIndex: number; componentIndex: number; replacement: string };

const describe = (mechanisms: StressMechanism[]) => {
  const text = mechanisms.map((m) => MECHANISM_TEXT[m]).join(" or ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const mechanismsAt = (m: Movement, site: Site): StressMechanism[] =>
  StressMechanism.options.filter((x) => m.stresses.some((s) => s.site === site && s.mechanisms.includes(x)));

/** The session's movements that load the site, grouped by the kinds of load they put on it. */
export function siteOptions(original: StructuredWorkout, site: Site, resolve: MovementResolver): SiteOption[] {
  const groups = new Map<string, SiteOption>();
  for (const c of original.blocks.flatMap((b) => b.components)) {
    const m = c.canonical ? resolve(c.canonical) : null;
    const mechanisms = m ? mechanismsAt(m, site) : [];
    if (!m || mechanisms.length === 0) continue;
    const key = mechanisms.join(",");
    const group = groups.get(key) ?? { label: describe(mechanisms), mechanisms, movements: [] };
    if (!group.movements.includes(m.name)) group.movements.push(m.name);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export interface QuestionArgs {
  original: StructuredWorkout;
  restrictions: Restriction[]; // the ones to clarify
  base: ActiveCondition[]; // profile, today's conditions and earlier restrictions (refine)
  offset?: number; // earlier restrictions, so keys match the pipeline's
  equipment: Equipment[] | null;
  movements: Movement[];
}

/**
 * Questions only where the athlete's scope is unclear: a painful site with nothing named, and a banned movement
 * whose best replacement loads the painful site the same way (the first candidate sharing nothing preselected).
 */
export function buildQuestions(args: QuestionArgs): ClarifyQuestion[] {
  const offset = args.offset ?? 0;
  const resolve = createMovementResolver(args.movements);
  const active = [...args.base, ...restrictionConditions(args.restrictions, offset)];
  const plan = planComponents(args.original, { movements: args.movements, resolve, active, equipment: args.equipment });
  const out: ClarifyQuestion[] = [];
  args.restrictions.forEach((r, i) => {
    const site = r.site;
    if (!site) return;
    if (!hasScope(r)) {
      const options = siteOptions(args.original, site, resolve);
      if (options.length > 0) out.push({ kind: "site", restriction: i, site, side: r.side, evidence: r.evidence, options });
      return;
    }
    for (const p of plan) {
      if (!p.needsChange || !p.reasons.some((x) => x.conditionKey === restrictionKey(offset + i))) continue;
      const at = (q: { blockIndex: number; componentIndex: number }) => q.blockIndex === p.blockIndex && q.componentIndex === p.componentIndex;
      if (r.replacements.some(at) || out.some((q) => q.kind === "replacement" && at(q))) continue;
      const banned = resolve(p.canonical!)!;
      const shared = (name: string) => {
        const theirs = mechanismsAt(resolve(name)!, site);
        return mechanismsAt(banned, site).filter((x) => theirs.includes(x));
      };
      const options = p.candidates.map((c) => ({ name: c.name, shared: shared(c.name) }));
      if (options.length === 0 || options[0].shared.length === 0) continue;
      out.push({
        kind: "replacement", restriction: i, blockIndex: p.blockIndex, componentIndex: p.componentIndex,
        movement: banned.name, site, options, preselected: (options.find((o) => o.shared.length === 0) ?? options[0]).name,
      });
    }
  });
  return out;
}

export function applyAnswers(restrictions: Restriction[], answers: ClarifyAnswer[]): Restriction[] {
  return restrictions.map((r, i) => answers.filter((a) => a.restriction === i).reduce((acc, a): Restriction => {
    if (a.kind === "replacement") {
      const { blockIndex, componentIndex, replacement } = a;
      return { ...acc, replacements: [...acc.replacements, { blockIndex, componentIndex, replacement }] };
    }
    if (a.mechanisms === "none") return acc;
    const picked = a.mechanisms === "all" ? StressMechanism.options : a.mechanisms;
    return { ...acc, mechanisms: StressMechanism.options.filter((m) => acc.mechanisms.includes(m) || picked.includes(m)) };
  }, r));
}

/** How the eval plays the athlete: every load on a painful site, and the preselected replacement. */
export function conservativeAnswers(questions: ClarifyQuestion[]): ClarifyAnswer[] {
  return questions.map((q): ClarifyAnswer => q.kind === "site"
    ? { kind: "site", restriction: q.restriction, mechanisms: "all" }
    : { kind: "replacement", restriction: q.restriction, blockIndex: q.blockIndex, componentIndex: q.componentIndex, replacement: q.preselected });
}

/**
 * A free-text answer to a site question, re-analyzed once: its restrictions replace the vague one, a site still
 * named alone bans every load on it (no second round of site questions), and only replacement questions remain,
 * re-indexed into the merged list (the re-analysis saw the others as the session's earlier restrictions).
 */
export function mergeFreeText(
  restrictions: Restriction[], index: number, reading: { restrictions: Restriction[]; questions: ClarifyQuestion[] },
): { restrictions: Restriction[]; questions: ClarifyQuestion[] } {
  const others = restrictions.filter((_, i) => i !== index);
  // The answer was about the asked site: one that names none ("only when I hang") keeps it.
  const asked = restrictions[index];
  const added = reading.restrictions
    .map((r) => (r.site ? r : { ...r, site: asked.site, side: r.side ?? asked.side }))
    .map((r) => (r.site && !hasScope(r) ? { ...r, mechanisms: StressMechanism.options } : r));
  return {
    restrictions: [...others, ...added],
    questions: reading.questions.filter((q) => q.kind === "replacement").map((q) => ({ ...q, restriction: others.length + q.restriction })),
  };
}
