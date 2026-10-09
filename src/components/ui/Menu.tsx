"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import { place } from "./place";
import { stepEnabled } from "./radio-keys";

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean };
type Props = {
  label: string;
  items: MenuItem[];
  icon?: React.ReactNode;
  /** A smaller trigger, for controls laid over content (planner tiles). */
  compact?: boolean;
  align?: "start" | "end";
  className?: string;
};

/**
 * Icon trigger plus a popup list of actions; Esc, an outside pointer down, focus leaving, a scroll or a choice
 * closes it. The popup is portaled with fixed positioning so scroll containers (the planner board) cannot clip it.
 */
export function Menu({ label, items, icon, compact = false, align = "end", className }: Props) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", visibility: "hidden" });
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const inside = (node: Node | null) => Boolean(node && (root.current?.contains(node) || popup.current?.contains(node)));

  useLayoutEffect(() => {
    if (!open || !trigger.current || !popup.current) return;
    setStyle(place(trigger.current.getBoundingClientRect(), popup.current.offsetHeight, align));
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!inside(e.target as Node)) setOpen(false);
    };
    // Fixed popup: it would drift away from its trigger on scroll or resize.
    const dismiss = (e: Event) => {
      if (!inside(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  function toggle() {
    setStyle({ position: "fixed", visibility: "hidden" });
    setOpen((o) => !o);
  }

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : null;
    if (delta === null) return;
    e.preventDefault();
    const current = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    itemRefs.current[stepEnabled(items.map(() => false), Math.max(current, 0), delta)]?.focus();
  }

  return (
    // React events bubble through the portal, so keys and blur from the popup reach this element.
    <div ref={root} className={cx("relative", className)} onKeyDown={open ? onKeyDown : undefined}
      onBlur={open ? (e) => { if (!inside(e.relatedTarget)) setOpen(false); } : undefined}>
      <IconButton ref={trigger} label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        // While open, pressing the trigger must not blur the focused item first (that would close, then reopen).
        onMouseDown={open ? (e) => e.preventDefault() : undefined} onClick={toggle} size={compact ? "sm" : "md"}>
        {icon ?? <ChevronDown size={compact ? 14 : 18} aria-hidden />}
      </IconButton>
      {open && createPortal(
        <div ref={popup} id={menuId} role="menu" aria-label={label} style={style}
          // Safari does not focus a pressed button: the blur would close the menu before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          className="z-40 min-w-44 rounded-xl border bg-surface p-1 shadow-lg">
          {items.map((item, i) => (
            <button key={item.label} ref={(el) => { itemRefs.current[i] = el; }} type="button" role="menuitem" tabIndex={-1}
              onClick={() => { close(); item.onSelect(); }}
              className={cx("flex w-full rounded-lg px-3 py-2 text-left text-sm font-medium outline-none hover:bg-surface-2 focus:bg-surface-2",
                item.danger ? "text-danger" : "text-foreground")}>
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
