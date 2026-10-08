import { useTranslations } from "next-intl";
import { MessageSquareText, PlayCircle } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cx } from "@/components/ui/cx";
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

function BlockBody({ block, oneRm, compact }: { block: CardBlock; oneRm: number | null; compact: boolean }) {
  const t = useTranslations("block");
  const text = compact ? "text-[13px] leading-snug" : "text-[15px] leading-relaxed";
  return (
    <>
      {block.kind === "custom" && block.scoring && block.scoring !== "none" && (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t(`scoring.${block.scoring as "for_time"}`)}
          {block.timeCapSeconds ? ` · ${t("timeCap", { minutes: block.timeCapSeconds / 60 })}` : ""}
        </p>
      )}
      {block.kind === "custom" && block.description && (
        <p className={cx("whitespace-pre-wrap text-foreground/80", text)}>{block.description}</p>
      )}
      {block.kind === "barbell" && (
        <div className={text}>
          {block.title && block.movement && <p className="font-semibold">{block.movement}</p>}
          <ul className="text-foreground/80">{describeSets(block.sets ?? [], oneRm).map((line, i) => <li key={i}>{line}</li>)}</ul>
          {block.instructions && <p className="mt-1 whitespace-pre-wrap text-foreground/80">{block.instructions}</p>}
        </div>
      )}
    </>
  );
}

/** One block: the athlete's card (stripe, tips and video as buttons) or, compact, the coach's planner tile. */
export function BlockCard({ block, oneRm = null, compact = false, children }: {
  block: CardBlock; oneRm?: number | null; compact?: boolean; children?: React.ReactNode;
}) {
  const t = useTranslations("block");
  const heading = block.title ?? (block.kind === "barbell" ? block.movement : null);

  if (compact) {
    return (
      <article data-color={blockColor(block.color)} className="flex flex-col gap-1.5 rounded-xl bg-(--block-fill) p-3">
        {heading && <h3 className="pr-16 text-sm font-bold leading-snug">{heading}</h3>}
        <BlockBody block={block} oneRm={oneRm} compact />
        {(block.coachingTips || block.videoUrl) && (
          <p className="flex flex-wrap items-center gap-3 text-xs font-semibold text-(--block-ink)">
            {block.coachingTips && <span className="inline-flex items-center gap-1"><MessageSquareText size={14} aria-hidden />{t("coachingTips")}</span>}
            {block.videoUrl && <span className="inline-flex items-center gap-1"><PlayCircle size={14} aria-hidden />{t("video")}</span>}
          </p>
        )}
        {children}
      </article>
    );
  }

  return (
    <Card as="article" stripe data-color={blockColor(block.color)} className="flex flex-col gap-3 p-5">
      {heading && <h3 className="text-lg font-bold leading-snug">{heading}</h3>}
      <BlockBody block={block} oneRm={oneRm} compact={false} />
      {block.coachingTips && (
        <details>
          <summary className={cx(buttonClasses({ variant: "tinted", block: true }), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
            <MessageSquareText size={18} aria-hidden />
            {t("coachingTips")}
          </summary>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{block.coachingTips}</p>
        </details>
      )}
      {block.videoUrl && (
        <Button href={block.videoUrl} target="_blank" rel="noopener noreferrer" block>
          <PlayCircle size={18} aria-hidden />
          {t("video")}
        </Button>
      )}
      {children}
    </Card>
  );
}
