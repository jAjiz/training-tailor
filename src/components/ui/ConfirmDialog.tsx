"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "./Button";
import { Modal } from "./Modal";

export type ConfirmOptions = {
  title: string;
  message: string;
  /** The button that goes ahead; destructive by default. */
  confirmLabel: string;
  danger?: boolean;
};

type Props = ConfirmOptions & { onAnswer: (yes: boolean) => void };

/** A yes/no question in the app's own dialog. Cancel holds the focus: Enter never confirms by accident. */
export function ConfirmDialog({ title, message, confirmLabel, danger = true, onAnswer }: Props) {
  const t = useTranslations("common");
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancel.current?.focus(); }, []);
  return (
    <Modal title={title} closeLabel={t("close")} onClose={() => onAnswer(false)} size="md"
      footer={<>
        <Button ref={cancel} type="button" onClick={() => onAnswer(false)}>{t("cancel")}</Button>
        <Button type="button" variant={danger ? "danger" : "primary"} onClick={() => onAnswer(true)}>{confirmLabel}</Button>
      </>}>
      <p className="text-[15px] leading-relaxed text-muted">{message}</p>
    </Modal>
  );
}

/**
 * window.confirm() with the app's dialog: `if (!(await confirm({...}))) return;`. Render `dialog` anywhere in the
 * component (it portals). Replaces the native prompt, which the app's built-in browser answers "no" unseen.
 */
export function useConfirm() {
  const [request, setRequest] = useState<{ options: ConfirmOptions; resolve: (yes: boolean) => void } | null>(null);
  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ options, resolve })),
    [],
  );
  const dialog = request && (
    <ConfirmDialog {...request.options} onAnswer={(yes) => { request.resolve(yes); setRequest(null); }} />
  );
  return { confirm, dialog };
}
