"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "./Button";
import { Input } from "./controls";
import { Modal } from "./Modal";

export type ConfirmOptions = {
  title: string;
  message: string;
  /** The button that goes ahead; destructive by default. */
  confirmLabel: string;
  danger?: boolean;
};

type Props = ConfirmOptions & {
  /** `text` is what was typed, when `typed` is set. */
  onAnswer: (yes: boolean, text?: string) => void;
  /** Shown under the message (e.g. what a deletion removes). */
  details?: React.ReactNode;
  /** The confirm button stays disabled until `expected` is typed (trimmed, any case). */
  typed?: { expected: string; label: string };
  /** While the answer is being acted on: both buttons disabled. */
  busy?: boolean;
};

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A yes/no question in the app's own dialog. Cancel holds the focus: Enter never confirms by accident. */
export function ConfirmDialog({ title, message, confirmLabel, danger = true, onAnswer, details, typed, busy = false }: Props) {
  const t = useTranslations("common");
  const cancel = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState("");
  const inputId = useId();
  useEffect(() => { cancel.current?.focus(); }, []);
  const ready = !typed || sameText(text, typed.expected);
  return (
    <Modal title={title} closeLabel={t("close")} onClose={() => onAnswer(false)} size="md"
      footer={<>
        <Button ref={cancel} type="button" disabled={busy} onClick={() => onAnswer(false)}>{t("cancel")}</Button>
        <Button type="button" variant={danger ? "danger" : "primary"} disabled={!ready || busy} onClick={() => onAnswer(true, typed ? text : undefined)}>{confirmLabel}</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <p className="text-[15px] leading-relaxed text-muted">{message}</p>
        {details}
        {typed && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="text-sm font-medium">{typed.label}</label>
            <Input id={inputId} type="text" autoComplete="off" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        )}
      </div>
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
