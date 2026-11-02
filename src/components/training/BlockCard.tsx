import { useTranslations } from "next-intl";
import { ChevronDown, MessageSquareText, PlayCircle } from "lucide-react";
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

/** The collapsed card's title: the block's title, its movement, else the first line of its text. */
function collapsedTitle(block: CardBlock): string | null {
  return block.title ?? (block.kind === "barbell" ? block.movement : null) ?? block.description?.trim().split("\n")[0] ?? null;
}

/**
 * One block: the athlete's card (stripe, tips and video as buttons) or, compact, the coach's planner tile.
 * The athlete's card starts collapsed to its title and `summary` (e.g. their result); tapping the title opens it.
 */
export function BlockCard({ block, oneRm = null, compact = false, summary, children }: {
  block: CardBlock; oneRm?: number | null; compact?: boolean; summary?: React.ReactNode; children?: React.ReactNode;
}) {
  const t = useTranslations("block");
  const heading = block.title ?? (block.kind === "barbell" ? block.movement : null);

  if (compact) {
    return (
      <article data-color={blockColor(block.color)} className="flex min-w-0 flex-col gap-1.5 break-words rounded-xl bg-(--block-fill) p-3">
        {heading && <h3 className="pr-8 text-sm font-bold leading-snug">{heading}</h3>}
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
    <Card as="article" stripe data-color={blockColor(block.color)} className="min-w-0 break-words">
      <details className="group/block">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 focus-visible:outline-2 focus-visible:outline-foreground [&::-webkit-details-marker]:hidden">
          {/* A title taken from the text is cut to one line; a real title wraps. */}
          <h3 className={cx("min-w-0 flex-1 text-lg font-bold leading-snug", !heading && "truncate")}>{collapsedTitle(block) ?? t("untitled")}</h3>
          {summary && <span className="shrink-0 text-sm font-semibold text-(--block-ink)">{summary}</span>}
          <ChevronDown size={20} aria-hidden className="shrink-0 text-muted transition group-open/block:rotate-180" />
        </summary>
        <div className="flex flex-col gap-3 px-5 pb-5">
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
        </div>
      </details>
    </Card>
  );
}
