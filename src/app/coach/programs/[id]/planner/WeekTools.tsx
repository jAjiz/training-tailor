"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { Pill } from "@/components/ui/Pill";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";
import { clearWeekAction, duplicateWeekAction } from "../../../block-actions";
import { setProgramPublishedAction, setWeekPublishedAction } from "../../../program-actions";
import { setWeekNoteAction } from "../../../note-actions";
import { ClearDialog } from "./ClearDialog";
import { CopyDialog } from "./CopyDialog";
import { ImportDialog } from "./ImportDialog";
import { NoteDialog } from "./NoteDialog";
import type { PlannerContext } from "./types";

type Props = {
  ctx: PlannerContext;
  kind: "continuous" | "closed";
  published: boolean;
  empty: boolean;
  /** Every published week index, so the import window can warn on any week it targets. */
  publishedWeeks: number[];
  /** Week indexes that already hold blocks: importing there asks whether to add or replace. */
  filledWeeks: number[];
  /** The coach's note for the week, shown as a strip under the toolbar. */
  weekNote: string | null;
  /** Results athletes logged on the week's blocks, which clearing it deletes. */
  resultCount: number;
};

export function WeekTools({ ctx, kind, published, empty, publishedWeeks, filledWeeks, weekNote, resultCount }: Props) {
  const t = useTranslations("planner");
  const ti = useTranslations("import");
  const te = useTranslations("errors");
  const router = useRouter();
  const [error, setError] = useState<ErrorCode | null>(null);
  const [copying, setCopying] = useState(false);
  const [importing, setImporting] = useState(false);
  const [noting, setNoting] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function run(action: Promise<ActionResult>) {
    const r = await action;
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  const refreshed = (r: ActionResult) => {
    if (r.ok) router.refresh();
    return r;
  };

  const toggle = () => run(kind === "continuous"
    ? setWeekPublishedAction({ programId: ctx.programId, weekIndex: ctx.weekIndex, published: !published })
    : setProgramPublishedAction({ programId: ctx.programId, published: !published }));

  // An empty week cannot be published (unpublishing one left over from before stays possible).
  const blockedEmpty = kind === "continuous" && !published && empty;

  const status = kind === "continuous"
    ? (published ? t("weekPublished") : t("weekDraft"))
    : (published ? t("programPublished") : t("programDraft"));
  const action = kind === "continuous"
    ? (published ? t("unpublishWeek") : t("publishWeek"))
    : (published ? t("unpublishProgram") : t("publishProgram"));

  return (
    <>
    <div className="flex flex-wrap items-center gap-3">
      <Pill tone={published ? "success" : "neutral"}>{status}</Pill>
      {!ctx.readOnly && (
        <>
          <Button type="button" size="sm" variant={published ? "secondary" : "primary"} onClick={toggle} disabled={blockedEmpty}>{action}</Button>
          <Button type="button" size="sm" title={ti("tooltip")} onClick={() => setImporting(true)}>{ti("button")}</Button>
          <Menu label={t("weekActions")} items={[
            { label: t("weekNote"), onSelect: () => setNoting(true) },
            { label: t("duplicateWeek"), onSelect: () => setCopying(true) },
            ...(empty ? [] : [{ label: t("clearWeek"), onSelect: () => setClearing(true), danger: true }]),
          ]} />
        </>
      )}
      {error && <span role="alert" className="text-sm text-danger">{te(error)}</span>}
      {copying && (
        <CopyDialog title={t("duplicateWeek")} target="week" startDate={ctx.startDate} defaultIndex={ctx.weekIndex + 1} maxWeek={ctx.maxWeek}
          onCopy={(toWeek) => duplicateWeekAction({ programId: ctx.programId, fromWeek: ctx.weekIndex, toWeek })}
          onClose={() => setCopying(false)} onDone={() => router.refresh()} />
      )}
      {clearing && (
        <ClearDialog title={t("clearWeek")} message={t("clearWeekConfirm")} resultCount={resultCount}
          onClear={() => clearWeekAction({ programId: ctx.programId, weekIndex: ctx.weekIndex })} onClose={() => setClearing(false)} />
      )}
      {importing && <ImportDialog ctx={ctx} publishedWeeks={publishedWeeks} filledWeeks={filledWeeks} onClose={() => setImporting(false)} />}
    </div>
    {weekNote !== null && (ctx.readOnly
      ? <p data-color="neutral" className="line-clamp-2 w-full whitespace-pre-wrap rounded-xl bg-(--block-fill) px-4 py-3 text-sm text-(--block-ink)">{weekNote}</p>
      : <button type="button" data-color="neutral" onClick={() => setNoting(true)}
          className="line-clamp-2 w-full cursor-pointer whitespace-pre-wrap rounded-xl bg-(--block-fill) px-4 py-3 text-left text-sm text-(--block-ink) focus-visible:outline-2 focus-visible:outline-foreground">{weekNote}</button>)}
    {noting && (
      <NoteDialog title={t("noteDialogWeek")} initial={weekNote}
        onSave={(body) => setWeekNoteAction({ programId: ctx.programId, weekIndex: ctx.weekIndex, body }).then(refreshed)}
        onClose={() => setNoting(false)} />
    )}
    </>
  );
}
