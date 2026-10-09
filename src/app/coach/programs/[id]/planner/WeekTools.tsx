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
import type { PlannerContext } from "./types";

type Props = { ctx: PlannerContext; kind: "continuous" | "closed"; published: boolean };

export function WeekTools({ ctx, kind, published }: Props) {
  const t = useTranslations("planner");
  const te = useTranslations("errors");
  const router = useRouter();
  const [error, setError] = useState<ErrorCode | null>(null);
  const [copying, setCopying] = useState(false);

  async function run(action: Promise<ActionResult>) {
    const r = await action;
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  const toggle = () => run(kind === "continuous"
    ? setWeekPublishedAction({ programId: ctx.programId, weekIndex: ctx.weekIndex, published: !published })
    : setProgramPublishedAction({ programId: ctx.programId, published: !published }));

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
          <Button type="button" size="sm" variant={published ? "secondary" : "primary"} onClick={toggle}>{action}</Button>
          <Menu label={t("weekActions")} items={[{ label: t("duplicateWeek"), onSelect: () => setCopying(true) }]} />
        </>
      )}
      {error && <span role="alert" className="text-sm text-danger">{te(error)}</span>}
      {copying && (
        <CopyDialog title={t("duplicateWeek")} target="week" startDate={ctx.startDate} defaultIndex={ctx.weekIndex + 1} maxWeek={ctx.maxWeek}
          onCopy={(toWeek) => duplicateWeekAction({ programId: ctx.programId, fromWeek: ctx.weekIndex, toWeek })}
          onClose={() => setCopying(false)} onDone={() => router.refresh()} />
      )}
    </div>
  );
}
