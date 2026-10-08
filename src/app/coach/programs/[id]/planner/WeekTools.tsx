"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";
import { duplicateWeekAction } from "../../../block-actions";
import { setProgramPublishedAction, setWeekPublishedAction } from "../../../program-actions";
import { CopyForm } from "./CopyForm";
import type { PlannerContext } from "./types";

type Props = { ctx: PlannerContext; kind: "continuous" | "closed"; published: boolean };

export function WeekTools({ ctx, kind, published }: Props) {
  const t = useTranslations("planner");
  const te = useTranslations("errors");
  const router = useRouter();
  const [error, setError] = useState<ErrorCode | null>(null);

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
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <span className={published ? "text-green-700" : "text-neutral-500"}>{status}</span>
      {!ctx.readOnly && (
        <>
          <button onClick={toggle} className={published ? "underline" : "rounded bg-black px-3 py-1 text-white"}>{action}</button>
          <CopyForm label={t("duplicateWeek")} withDay={false} defaultWeek={ctx.weekIndex + 1} maxWeek={ctx.maxWeek}
            onCopy={(week) => duplicateWeekAction({ programId: ctx.programId, fromWeek: ctx.weekIndex, toWeek: week })}
            onDone={() => router.refresh()} />
        </>
      )}
      {error && <span className="text-red-700">{te(error)}</span>}
    </div>
  );
}
