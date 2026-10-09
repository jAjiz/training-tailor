"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { place } from "./place";

type Props = {
  /** The control that opened it: positions the popup and gets focus back on Esc. */
  anchor: React.RefObject<HTMLElement | null>;
  label: string;
  onClose: () => void;
  align?: "start" | "end";
  children: React.ReactNode;
};

/**
 * A non-modal popup under its anchor. An outside press, Esc, a scroll or a resize closes it. It is portaled
 * with fixed positioning, into the anchor's open <dialog> when there is one: the page body sits under a modal's
 * top layer, where the popup would be hidden and inert.
 */
export function Popover({ anchor, label, onClose, align = "start", children }: Props) {
  const popup = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", visibility: "hidden" });
  const [host] = useState(() => anchor.current?.closest("dialog") ?? document.body);
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; });

  useLayoutEffect(() => {
    if (anchor.current && popup.current) setStyle(place(anchor.current.getBoundingClientRect(), popup.current.offsetHeight, align));
  }, [anchor, align]);

  useEffect(() => {
    const inside = (node: EventTarget | null) =>
      node instanceof Node && Boolean(popup.current?.contains(node) || anchor.current?.contains(node));
    const onPointerDown = (e: PointerEvent) => { if (!inside(e.target)) close.current(); };
    const dismiss = (e: Event) => { if (!inside(e.target)) close.current(); };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [anchor]);

  // Inside a modal, Esc reaches the <dialog> as a "cancel" whatever the keydown does: take it before the
  // Modal's own handler (a capture listener runs first at the target) so only the popup closes.
  useEffect(() => {
    if (!(host instanceof HTMLDialogElement)) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      close.current();
      anchor.current?.focus();
    };
    host.addEventListener("cancel", onCancel, { capture: true });
    return () => host.removeEventListener("cancel", onCancel, { capture: true });
  }, [host, anchor]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Escape" || host instanceof HTMLDialogElement) return;
    e.preventDefault();
    onClose();
    anchor.current?.focus();
  }

  return createPortal(
    <div ref={popup} role="dialog" aria-label={label} style={style} onKeyDown={onKeyDown}
      className="z-40 rounded-2xl border bg-surface p-3 shadow-lg">
      {children}
    </div>,
    host,
  );
}
