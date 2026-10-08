"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import { stepEnabled } from "./radio-keys";

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean };
type Props = { label: string; items: MenuItem[]; icon?: React.ReactNode; align?: "start" | "end"; className?: string };

/** Icon trigger plus a popup list of actions; Esc, an outside pointer down or a choice closes it. */
export function Menu({ label, items, icon, align = "end", className }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

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
    <div ref={root} className={cx("relative", className)} onKeyDown={open ? onKeyDown : undefined}>
      <IconButton ref={trigger} label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}>
        {icon ?? <MoreHorizontal size={18} aria-hidden />}
      </IconButton>
      {open && (
        <div id={menuId} role="menu" aria-label={label}
          className={cx("absolute top-full z-20 mt-1 min-w-44 rounded-xl border bg-surface p-1 shadow-lg", align === "end" ? "right-0" : "left-0")}>
          {items.map((item, i) => (
            <button key={item.label} ref={(el) => { itemRefs.current[i] = el; }} type="button" role="menuitem" tabIndex={-1}
              onClick={() => { close(); item.onSelect(); }}
              className={cx("flex w-full rounded-lg px-3 py-2 text-left text-sm font-medium outline-none hover:bg-surface-2 focus:bg-surface-2",
                item.danger ? "text-danger" : "text-foreground")}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
