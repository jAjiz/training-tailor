import { WorkoutView } from "@/components/WorkoutView";
import { REMOVED_MOVEMENT, type Finding, type PipelineResult, type WorkoutComponent } from "@/lib/engine/types";

const BADGE: Partial<Record<Finding["kind"], { text: string; className: string }>> = {
  caution_movement: { text: "caution", className: "bg-amber-100 text-amber-900" },
  unrecognized_movement: { text: "not verified", className: "bg-neutral-200 text-neutral-800" },
  equipment_unavailable: { text: "missing equipment", className: "bg-red-100 text-red-900" },
  contraindicated_movement: { text: "contraindicated", className: "bg-red-100 text-red-900" },
};

export function ResultView({ result, conditionLabels }: { result: PipelineResult; conditionLabels: Record<string, string> }) {
  const { tailored } = result;
  const badges = (blockIndex: number, c: WorkoutComponent) =>
    result.findings
      .filter((f) => f.blockIndex === blockIndex && f.movement === (c.canonical ?? c.movement) && BADGE[f.kind])
      .map((f) => (
        <span key={f.kind} title={f.message} className={`mr-2 rounded px-2 text-xs ${BADGE[f.kind]!.className}`}>
          {BADGE[f.kind]!.text}
        </span>
      ));

  return (
    <div className="flex flex-col gap-6">
      {result.conditions.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {result.conditions.map((c) => (
            <span key={c.key} className="rounded border px-2 py-1">
              {conditionLabels[c.key] ?? c.key}{c.side ? ` (${c.side})` : ""} · {c.severity}
              {c.source === "today" ? " · today" : ""}
            </span>
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
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">{tailored.safetyNote}</p>
      )}

      {result.findings.some((f) => !BADGE[f.kind] || f.blockIndex === null) && (
        <section>
          <h3 className="font-semibold">Checks</h3>
          <ul className="list-disc pl-5 text-sm text-neutral-700">
            {result.findings.filter((f) => !BADGE[f.kind] || f.blockIndex === null).map((f, i) => <li key={i}>{f.message}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
