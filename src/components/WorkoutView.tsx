import type { ReactNode } from "react";
import { renderComponent } from "@/lib/engine/render-text";
import type { WorkoutBlock, WorkoutComponent } from "@/lib/engine/types";

interface Props {
  heading: string;
  name: string | null;
  blocks: WorkoutBlock[];
  badge?: (blockIndex: number, component: WorkoutComponent) => ReactNode;
}

const words = (s: string) => s.replaceAll("_", " ");

export function WorkoutView({ heading, name, blocks, badge }: Props) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{heading}</h3>
      {/* A single block usually carries the session name as its title: show it once. */}
      {name && !(blocks.length === 1 && blocks[0].title === name) && <div className="font-medium">{name}</div>}
      {blocks.map((b, i) => (
        <div key={i} className="rounded border p-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">{b.title ?? `Block ${i + 1}`}</span>
            {b.day !== null && <span className="text-xs text-neutral-500">Day {b.day}</span>}
            <span className="text-xs text-neutral-500">
              {words(b.format)}{b.timeDomainMinutes !== null ? ` · ~${b.timeDomainMinutes} min` : ""}
            </span>
            {b.stimulus && (
              <span className="rounded bg-neutral-100 px-2 text-xs">
                {words(b.stimulus.quality)}{b.stimulus.energySystem ? ` · ${b.stimulus.energySystem}` : ""}
              </span>
            )}
          </div>
          {b.scheme && <div className="text-sm">{b.scheme}</div>}
          {b.components.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {b.components.map((c, j) => (
                <li key={j}>{badge?.(i, c)}{renderComponent(c)}</li>
              ))}
            </ul>
          ) : (
            <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">{b.rawText}</pre>
          )}
          {b.coachingNotes && <p className="mt-1 text-xs text-neutral-600">{b.coachingNotes}</p>}
        </div>
      ))}
    </section>
  );
}
