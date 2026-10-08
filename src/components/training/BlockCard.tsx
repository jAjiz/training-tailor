import { useTranslations } from "next-intl";
import { describeSets } from "@/lib/training/barbell";
import type { BarbellSet } from "@/lib/training/schemas";
import { blockColor } from "./colors";

export type CardBlock = {
  kind: string;
  title: string | null;
  color: string;
  description: string | null;
  scoring: string | null;
  timeCapSeconds: number | null;
  movement: string | null;
  sets: BarbellSet[] | null;
  instructions: string | null;
  coachingTips: string | null;
  videoUrl: string | null;
};

/** One block as athletes see it; the coach planner shows the same card with its tools as children. */
export function BlockCard({ block, oneRm = null, children }: { block: CardBlock; oneRm?: number | null; children?: React.ReactNode }) {
  const t = useTranslations("block");
  const heading = block.title ?? (block.kind === "barbell" ? block.movement : null);
  return (
    <article data-color={blockColor(block.color)} className="flex flex-col gap-2 rounded border border-l-4 border-l-(--block-stripe) p-3">
      {heading && <h3 className="font-semibold">{heading}</h3>}
      {block.kind === "custom" && block.scoring && block.scoring !== "none" && (
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          {t(`scoring.${block.scoring as "for_time"}`)}
          {block.timeCapSeconds ? ` · ${t("timeCap", { minutes: block.timeCapSeconds / 60 })}` : ""}
        </p>
      )}
      {block.kind === "custom" && block.description && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{block.description}</p>
      )}
      {block.kind === "barbell" && (
        <div className="text-sm">
          {block.title && block.movement && <p className="font-medium">{block.movement}</p>}
          <ul>{describeSets(block.sets ?? [], oneRm).map((line, i) => <li key={i}>{line}</li>)}</ul>
          {block.instructions && <p className="mt-1 whitespace-pre-wrap text-neutral-700">{block.instructions}</p>}
        </div>
      )}
      {block.coachingTips && (
        <details className="text-sm">
          <summary className="cursor-pointer text-amber-700">{t("coachingTips")}</summary>
          <p className="mt-1 whitespace-pre-wrap text-neutral-700">{block.coachingTips}</p>
        </details>
      )}
      {block.videoUrl && (
        <a href={block.videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">{t("video")}</a>
      )}
      {children}
    </article>
  );
}
