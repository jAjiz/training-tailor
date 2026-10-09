import { WorkoutView } from "@/components/WorkoutView";
import { componentFindings } from "@/lib/findings";
import { REMOVED_MOVEMENT, type Finding, type PipelineResult, type Restriction, type WorkoutComponent } from "@/lib/engine/types";

export interface CatalogEntry {
  key: string;
  label: string;
  kind: string; // "injury" | "limitation" | "condition"
}

/** "Shoulder (right) · no Power Snatch · today": exactly what the restriction bans. */
function restrictionText(r: Restriction): string {
  const site = r.site ? r.site.charAt(0).toUpperCase() + r.site.slice(1).replaceAll("_", " ") : "Today";
  const loads = r.mechanisms.length > 4 ? ["no load on it"] : r.mechanisms.map((m) => `no ${m.replaceAll("_", " ")}`);
  // A general name ("snatch") expands to every variant: name the first ones, count the rest (all in the tooltip).
  const named = r.movements.length > 3
    ? [`no ${r.movements.slice(0, 2).join(", ")} +${r.movements.length - 2} variants`]
    : r.movements.map((m) => `no ${m}`);
  const bans = [...named, ...loads, ...r.positions.map((p) => `no ${p.replaceAll("_", " ")}`)];
  return [`${site}${r.side ? ` (${r.side})` : ""}`, bans.join(", ") || "context only", ...(r.site ? ["today"] : [])].join(" · ");
}

// Badge colors come from the block color tokens (data-color on the badge).
const BADGE: Partial<Record<Finding["kind"], { text: string; color: "yellow" | "neutral" | "red" }>> = {
  caution_movement: { text: "caution", color: "yellow" },
  unrecognized_movement: { text: "not verified", color: "neutral" },
  equipment_unavailable: { text: "missing equipment", color: "red" },
  contraindicated_movement: { text: "contraindicated", color: "red" },
};

export function ResultView({ result, catalog }: { result: PipelineResult; catalog: CatalogEntry[] }) {
  const { tailored } = result;
  const entry = (key: string) => catalog.find((x) => x.key === key);
  const badges = (blockIndex: number, c: WorkoutComponent) =>
    componentFindings(result.findings, blockIndex, c.canonical ?? c.movement)
      .filter((f) => BADGE[f.kind])
      .map((f) => (
        <span key={f.kind} title={f.message} data-color={BADGE[f.kind]!.color} className="mr-2 rounded-full bg-(--block-fill) px-2 text-xs font-semibold text-(--block-ink)">
          {BADGE[f.kind]!.text}
        </span>
      ));

  return (
    <div className="flex flex-col gap-6">
      {result.conditions.length + result.restrictions.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {result.conditions.map((c) => (
            <span key={c.key} className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">
              {entry(c.key)?.label ?? c.key}{c.side ? ` (${c.side})` : ""}
              {/* Severity only grades injuries; a limitation or condition always applies in full. */}
              {entry(c.key)?.kind === "injury" ? ` · ${c.severity}` : ""}
              {c.source === "today" ? " · today" : ""}
            </span>
          ))}
          {result.restrictions.map((r, i) => (
            <span key={`r${i}`} title={[r.evidence, ...r.movements].join(" · ")} className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">{restrictionText(r)}</span>
          ))}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <WorkoutView heading="Original" name={result.original.name} blocks={result.original.blocks} />
        <WorkoutView heading="Tailored for today" name={tailored.name} blocks={tailored.blocks} badge={badges} />
      </div>

      {tailored.droppedBlocks.length > 0 && (
        <section>
          <h3 className="font-semibold">Dropped</h3>
          <ul className="list-disc pl-5 text-sm">
            {tailored.droppedBlocks.map((d) => (
              <li key={d.index}>{result.original.blocks[d.index]?.title ?? `Block ${d.index + 1}`}: {d.reason}</li>
            ))}
          </ul>
        </section>
      )}

      {tailored.changes.length > 0 && (
        <section>
          <h3 className="font-semibold">What changed</h3>
          <ul className="list-disc pl-5 text-sm">
            {tailored.changes.map((c, i) => (
              <li key={i}>
                <span className="line-through">{c.original}</span> →{" "}
                {c.modified === REMOVED_MOVEMENT ? <i>removed</i> : <b>{c.modified}</b>}: {c.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="font-semibold">Why the stimulus is preserved</h3>
        <p className="text-sm">{tailored.rationale}</p>
      </section>

      {tailored.safetyNote && (
        <p data-color="yellow" className="rounded-xl bg-(--block-fill) p-3 text-sm text-(--block-ink)">{tailored.safetyNote}</p>
      )}

      {result.findings.some((f) => !BADGE[f.kind] || f.blockIndex === null) && (
        <section>
          <h3 className="font-semibold">Checks</h3>
          <ul className="list-disc pl-5 text-sm text-muted">
            {result.findings.filter((f) => !BADGE[f.kind] || f.blockIndex === null).map((f, i) => <li key={i}>{f.message}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
