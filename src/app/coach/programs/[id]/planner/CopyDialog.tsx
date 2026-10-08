"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";

type Props = {
  title: string;
  withDay: boolean;
  defaultWeek: number;
  maxWeek: number | null;
  onCopy: (week: number, day: number | null) => Promise<ActionResult>;
  onClose: () => void;
  onDone: () => void;
};

/** Asks for a target week (and day), 1-based on screen, 0-based to the action. */
export function CopyDialog({ title, withDay, defaultWeek, maxWeek, onCopy, onClose, onDone }: Props) {
  const t = useTranslations();
  const formId = useId();
  const [week, setWeek] = useState(String(defaultWeek + 1));
  const [day, setDay] = useState("1");
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    let r: ActionResult;
    try {
      r = await onCopy(Number(week) - 1, withDay ? Number(day) - 1 : null);
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
        <Field label={t("planner.targetWeek")} className="flex-1">
          <Input type="number" required min={1} max={maxWeek === null ? undefined : maxWeek + 1} value={week} onChange={(e) => setWeek(e.target.value)} />
        </Field>
        {withDay && (
          <Field label={t("planner.targetDay")} className="flex-1">
            <Input type="number" required min={1} max={7} value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
        )}
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{t(`errors.${error}`)}</p>}
    </Modal>
  );
}
