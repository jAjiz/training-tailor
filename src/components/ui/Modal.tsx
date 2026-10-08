"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "./cx";
import { IconButton } from "./IconButton";

type Props = {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "lg";
};

/**
 * Native <dialog> opened with showModal(): the browser traps focus, makes the page inert and handles Esc.
 * Mounted open; the parent unmounts it to close. Portaled to document.body so transformed ancestors
 * (dnd-kit sortables) cannot offset it.
 */
export function Modal({ title, closeLabel, onClose, children, footer, size = "lg" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      opener?.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog ref={ref} aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      // A close the browser forces (a repeated Esc without user activation skips "cancel") still reaches the parent.
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className={cx(
        "m-auto max-h-[90vh] w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-chrome/50 open:flex",
        size === "lg" ? "max-w-2xl" : "max-w-sm",
      )}>
      <header className="flex items-center justify-between gap-4 px-6 pb-2 pt-5">
        <h2 id={titleId} className="text-lg font-bold">{title}</h2>
        <IconButton label={closeLabel} onClick={onClose}><X size={18} aria-hidden /></IconButton>
      </header>
      <div className="flex-1 overflow-y-auto px-6 pb-5 pt-2">{children}</div>
      {footer && <footer className="flex flex-wrap items-center justify-end gap-3 border-t px-6 py-4">{footer}</footer>}
    </dialog>,
    document.body,
  );
}
