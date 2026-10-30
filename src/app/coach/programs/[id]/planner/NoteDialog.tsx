"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/controls";
import { Modal } from "@/components/ui/Modal";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";
import { NOTE_MAX } from "@/lib/training/schemas";

type Props = {
  title: string;
  initial: string | null;
  onSave: (body: string) => Promise<ActionResult>;
  onClose: () => void;
};

/** Edits a day or week note. Saving it empty removes it. */
export function NoteDialog({ title, initial, onSave, onClose }: Props) {
  const t = useTranslations();
  const formId = useId();
  const [body, setBody] = useState(initial ?? "");
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    let r: ActionResult;
    try {
      r = await onSave(body);
    } catch {
      r = { ok: false, code: "internal" };
    } finally {
      setPending(false);
    }
    if (r.ok) onClose();
    else setError(r.code);
  }

  return (
    <Modal title={title} closeLabel={t("common.close")} onClose={onClose} size="sm"
      footer={<>
        <Button type="button" onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" form={formId} variant="primary" disabled={pending}>{t("common.save")}</Button>
      </>}>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-2">
        <Textarea aria-label={title} rows={6} maxLength={NOTE_MAX} value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="text-xs text-muted">{t("planner.noteHint")}</p>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{t(`errors.${error}`)}</p>}
    </Modal>
  );
}
