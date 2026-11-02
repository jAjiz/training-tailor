"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";

type Props = {
  title: string;
  /** What clearing deletes; the results it takes with them are added when there are any. */
  message: string;
  resultCount: number;
  onClear: () => Promise<ActionResult>;
  onClose: () => void;
};

/** Asks before clearing a day or a week; on failure it stays open with the error. */
export function ClearDialog({ title, message, resultCount, onClear, onClose }: Props) {
  const t = useTranslations("planner");
  const te = useTranslations("errors");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const full = resultCount > 0 ? `${message} ${t("clearResults", { count: resultCount })}` : message;
  return (
    <ConfirmDialog title={title} message={full} confirmLabel={t("clear")} busy={busy}
      details={error && <p role="alert" className="text-sm text-danger">{te(error)}</p>}
      onAnswer={async (yes) => {
        if (!yes) return onClose();
        setBusy(true);
        const r = await onClear();
        setBusy(false);
        if (!r.ok) return setError(r.code);
        onClose();
        router.refresh();
      }} />
  );
}
