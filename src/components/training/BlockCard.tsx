"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, MessageSquareText, MoreHorizontal, PlayCircle, Sparkles } from "lucide-react";
import { discardAdaptationAction } from "@/app/(athlete)/adapt-actions";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cx } from "@/components/ui/cx";
import { Menu } from "@/components/ui/Menu";
import { Pill } from "@/components/ui/Pill";
import type { TailoringResult } from "@/lib/engine/types";
import type { AdaptationMessage } from "@/lib/training/adaptation-types";
import { describeSets } from "@/lib/training/barbell";
import type { ErrorCode } from "@/lib/training/errors";
import type { BarbellSet } from "@/lib/training/schemas";
import { AdaptPanel } from "./AdaptPanel";
import { AdaptedBlock } from "./AdaptedBlock";
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

/** The athlete's adaptation of the block, on the day view. */
export type CardAdaptation = {
  blockId: string;
  /** Tailoring is on and the day has not passed: the Adapt button and panel are offered. */
  adaptable: boolean;
  /** The accepted adaptation; shown even when tailoring is off. */
  accepted: TailoringResult | null;
  /** The coach changed the block after the adaptation was accepted. */
  stale: boolean;
  messages: AdaptationMessage[];
};

function BlockBody({ block, oneRm, compact }: { block: CardBlock; oneRm: number | null; compact: boolean }) {
  const t = useTranslations("block");
  const locale = useLocale();
  const text = compact ? "text-[13px] leading-snug" : "text-[15px] leading-relaxed";
  return (
    <>
      {block.kind === "custom" && block.scoring && block.scoring !== "none" && (
        <p className={cx("type-label", compact ? "text-muted" : "text-accent-ink")}>
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
          {compact ? (
            <ul className="text-foreground/80">{describeSets(block.sets ?? [], oneRm, locale).map((line, i) => <li key={i}>{line}</li>)}</ul>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-2 px-1 text-foreground/80">
              {describeSets(block.sets ?? [], oneRm, locale).map((line, i) => <li key={i} className="slant px-2 py-0.5 before:bg-surface-2">{line}</li>)}
            </ul>
          )}
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
export function BlockCard({ block, oneRm = null, compact = false, summary, adaptation, children }: {
  block: CardBlock; oneRm?: number | null; compact?: boolean; summary?: React.ReactNode;
  adaptation?: CardAdaptation; children?: React.ReactNode;
}) {
  const t = useTranslations("block");
  const ta = useTranslations("adapt");
  const [showOriginal, setShowOriginal] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const accepted = adaptation?.accepted ?? null;
  // The coach changed the block after acceptance: the card keeps the coach's block and offers the old adaptation.
  const previous = adaptation?.stale ? accepted : null;
  // The adaptation in force: the card shows it instead of the coach's block (tips and video stay the coach's).
  const active = adaptation?.stale ? null : accepted;
  const heading = block.title ?? (block.kind === "barbell" ? block.movement : null);

  if (compact) {
    return (
      <article data-color={blockColor(block.color)} className="flex min-w-0 flex-col gap-1.5 break-words rounded-xl bg-(--block-fill) p-3">
        {heading && <h3 className="pr-8 text-sm leading-snug">{heading}</h3>}
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
          <h3 className={cx("min-w-0 flex-1 text-lg leading-snug", !heading && "truncate normal-case")}>{collapsedTitle(block) ?? t("untitled")}</h3>
          {active && <Pill tone="inverted" className="shrink-0">{ta("adapted")}</Pill>}
          {summary && <span className="shrink-0 text-sm font-semibold text-(--block-ink)">{summary}</span>}
          <ChevronDown size={20} aria-hidden className="shrink-0 text-muted transition group-open/block:rotate-180" />
        </summary>
        <div className="flex flex-col gap-3 px-5 pb-5">
          {previous && (
            <div data-color="yellow" className="flex flex-col gap-2 rounded-xl bg-(--block-fill) px-3 py-2 text-(--block-ink)">
              <p className="text-sm">{ta("stale")}</p>
              <div className="flex flex-wrap gap-2">
                {adaptation!.adaptable && <Button type="button" size="sm" variant="primary" onClick={() => setPanelOpen(true)}>{ta("again")}</Button>}
                <Button type="button" size="sm" aria-expanded={showPrevious} onClick={() => setShowPrevious((v) => !v)}>
                  {showPrevious ? ta("hidePrevious") : ta("seePrevious")}
                </Button>
              </div>
              {showPrevious && <div className="rounded-xl bg-surface p-3 text-foreground"><AdaptedBlock tailored={previous} /></div>}
            </div>
          )}
          {active && !showOriginal ? <AdaptedBlock tailored={active} /> : <BlockBody block={block} oneRm={oneRm} compact={false} />}
          {active && (
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="ghost" aria-pressed={showOriginal} onClick={() => setShowOriginal((v) => !v)}>
                {showOriginal ? ta("seeAdapted") : ta("seeOriginal")}
              </Button>
              <DiscardMenu blockId={adaptation!.blockId} />
            </div>
          )}
          {block.coachingTips && (
            <details>
              <summary className={cx(buttonClasses({ variant: "tinted", slanted: true, block: true }), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
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
          {adaptation?.adaptable && !previous && (
            <Button type="button" variant="tinted" size="sm" block slanted onClick={() => setPanelOpen(true)}>
              <Sparkles size={16} aria-hidden />
              {active ? ta("adjust") : ta("open")}
            </Button>
          )}
          {children}
        </div>
      </details>
      {/* Mounted while closed too, so a conversation in progress survives closing the panel. */}
      {adaptation?.adaptable && (
        <AdaptPanel blockId={adaptation.blockId} blockTitle={collapsedTitle(block) ?? t("untitled")} initialMessages={adaptation.messages}
          hasAccepted={active !== null} open={panelOpen} onClose={() => setPanelOpen(false)} />
      )}
    </Card>
  );
}

/** The adapted card's menu: discard the adaptation, after a confirmation. */
function DiscardMenu({ blockId }: { blockId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [error, setError] = useState<ErrorCode | null>(null);

  async function discard() {
    const yes = await confirm({ title: t("adapt.discardTitle"), message: t("adapt.discardMessage"), confirmLabel: t("adapt.discard") });
    if (!yes) return;
    setError(null);
    const r = await discardAdaptationAction(blockId);
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  return (
    <>
      <Menu label={t("adapt.menu")} icon={<MoreHorizontal size={18} aria-hidden />} items={[{ label: t("adapt.discard"), danger: true, onSelect: () => void discard() }]} />
      {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
      {dialog}
    </>
  );
}
