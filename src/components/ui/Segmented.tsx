"use client";

import { useRef } from "react";
import { cx } from "./cx";
import { arrowDelta, stepEnabled } from "./radio-keys";

export type SegmentedOption<T extends string> = { value: T; label: string; disabled?: boolean };
type Props<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
};

/** Segmented control (Strivee's Rx / Scaled) as an accessible radio group: one tab stop, arrows move and select. */
export function Segmented<T extends string>({ options, value, onChange, label, size = "md", className }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const disabled = options.map((o) => Boolean(o.disabled));
  const selected = options.findIndex((o) => o.value === value);
  const tabStop = selected >= 0 ? selected : disabled.indexOf(false);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const delta = arrowDelta(e.key);
    if (delta === null) return;
    e.preventDefault();
    const next = stepEnabled(disabled, index, delta);
    if (next === index) return;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className={cx("flex rounded-xl bg-surface-2 p-1", className)}>
      {options.map((o, i) => {
        const checked = i === selected;
        return (
          <button key={o.value} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={checked}
            tabIndex={i === tabStop ? 0 : -1} disabled={o.disabled} onClick={() => onChange(o.value)} onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              "flex-1 rounded-lg font-semibold transition disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-foreground",
              size === "sm" ? "px-3 py-1 text-sm" : "px-4 py-2 text-[15px]",
              checked ? "bg-raised text-foreground shadow-sm" : "text-muted hover:text-foreground",
            )}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
