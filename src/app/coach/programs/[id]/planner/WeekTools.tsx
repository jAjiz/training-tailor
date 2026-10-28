"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { Pill } from "@/components/ui/Pill";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";
import { duplicateWeekAction } from "../../../block-actions";
import { setProgramPublishedAction, setWeekPublishedAction } from "../../../program-actions";
import { CopyDialog } from "./CopyDialog";
import { ImportDialog } from "./ImportDialog";
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
};

export function WeekTools({ ctx, kind, published, empty, publishedWeeks, filledWeeks }: Props) {
  const t = useTranslations("planner");
  const ti = useTranslations("import");
  const te = useTranslations("errors");
  const router = useRouter();
  const [error, setError] = useState<ErrorCode | null>(null);
  const [copying, setCopying] = useState(false);
  const [importing, setImporting] = useState(false);

  async function run(action: Promise<ActionResult>) {
    const r = await action;
    if (r.ok) router.refresh();
    else setError(r.code);
  }

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
    <div className="flex flex-wrap items-center gap-3">
      <Pill tone={published ? "success" : "neutral"}>{status}</Pill>
      {!ctx.readOnly && (
        <>
          <Button type="button" size="sm" variant={published ? "secondary" : "primary"} onClick={toggle} disabled={blockedEmpty}>{action}</Button>
          <Button type="button" size="sm" title={ti("tooltip")} onClick={() => setImporting(true)}>{ti("button")}</Button>
          <Menu label={t("weekActions")} items={[{ label: t("duplicateWeek"), onSelect: () => setCopying(true) }]} />
        </>
      )}
      {error && <span role="alert" className="text-sm text-danger">{te(error)}</span>}
      {copying && (
        <CopyDialog title={t("duplicateWeek")} target="week" startDate={ctx.startDate} defaultIndex={ctx.weekIndex + 1} maxWeek={ctx.maxWeek}
          onCopy={(toWeek) => duplicateWeekAction({ programId: ctx.programId, fromWeek: ctx.weekIndex, toWeek })}
          onClose={() => setCopying(false)} onDone={() => router.refresh()} />
      )}
      {importing && <ImportDialog ctx={ctx} publishedWeeks={publishedWeeks} filledWeeks={filledWeeks} onClose={() => setImporting(false)} />}
    </div>
  );
}
