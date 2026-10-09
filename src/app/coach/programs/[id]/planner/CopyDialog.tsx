"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { closedTarget, continuousTarget, defaultTargetDate, type CopyTarget } from "@/lib/training/copy-target";
import type { IsoDate } from "@/lib/training/dates";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";

type Props = {
  title: string;
  /** "day": a block or a whole day goes to a day; "week": a whole week goes to a week. */
  target: CopyTarget;
  /** Continuous programs pick a date from their start; closed ones (null) pick week and day numbers. */
  startDate: IsoDate | null;
  /** The day index ("day") or week index ("week") the dialog proposes. */
  defaultIndex: number;
  maxWeek: number | null;
  onCopy: (index: number) => Promise<ActionResult>;
  onClose: () => void;
  onDone: () => void;
};

/** Asks where a copy goes and hands the action a 0-based day or week index. */
export function CopyDialog({ title, target, startDate, defaultIndex, maxWeek, onCopy, onClose, onDone }: Props) {
  const t = useTranslations();
  const formId = useId();
  const proposedWeek = target === "week" ? defaultIndex : Math.floor(defaultIndex / 7);
  // A closed program cannot go past its last week: propose the last one instead.
  const clamped = maxWeek === null ? proposedWeek : Math.min(proposedWeek, maxWeek);
  const [week, setWeek] = useState(String(clamped + 1));
  const [day, setDay] = useState(String(target === "day" ? (defaultIndex % 7) + 1 : 1));
  const [date, setDate] = useState(startDate ? defaultTargetDate(target, startDate, defaultIndex) : "");
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const index = startDate
      ? continuousTarget(target, startDate, date)
      : closedTarget(target, Number(week), target === "day" ? Number(day) : null);
    if (index === null) {
      setError("day_out_of_range");
      return;
    }
    setPending(true);
    setError(null);
    let r: ActionResult;
    try {
      r = await onCopy(index);
    } catch {
      r = { ok: false, code: "internal" };
    } finally {
      setPending(false);
    }
    if (r.ok) {
      onClose();
      onDone();
    } else {
      setError(r.code);
    }
  }

  return (
    <Modal title={title} closeLabel={t("common.close")} onClose={onClose} size="sm"
      footer={<>
        <Button type="button" onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" form={formId} variant="primary" disabled={pending}>{t("planner.copy")}</Button>
      </>}>
      <form id={formId} onSubmit={submit} className="flex gap-3">
        {startDate ? (
          <Field label={t(target === "week" ? "planner.targetWeekDate" : "planner.targetDate")}
            hint={target === "week" ? t("planner.targetWeekDateHint") : null} className="flex-1">
            <Input type="date" required min={startDate} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        ) : (
          <>
            <Field label={t("planner.targetWeek")} className="flex-1">
              <Input type="number" required min={1} max={maxWeek === null ? undefined : maxWeek + 1} value={week}
                onChange={(e) => setWeek(e.target.value)} />
            </Field>
            {target === "day" && (
              <Field label={t("planner.targetDay")} className="flex-1">
                <Input type="number" required min={1} max={7} value={day} onChange={(e) => setDay(e.target.value)} />
              </Field>
            )}
          </>
        )}
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{t(`errors.${error}`)}</p>}
    </Modal>
  );
}
