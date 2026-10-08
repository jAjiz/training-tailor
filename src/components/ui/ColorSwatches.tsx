"use client";

import { useRef } from "react";
import { cx } from "./cx";
import { arrowDelta, stepEnabled } from "./radio-keys";

type Props = {
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
  label: string;
  colorLabel: (color: string) => string;
};

/** Block colors as circles (fill with a stripe-colored rim); a radio group with arrow-key navigation. */
export function ColorSwatches({ colors, value, onChange, label, colorLabel }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(0, colors.indexOf(value));

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const delta = arrowDelta(e.key);
    if (delta === null) return;
    e.preventDefault();
    const next = stepEnabled(colors.map(() => false), index, delta);
    onChange(colors[next]);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2.5">
      {colors.map((c, i) => (
        <button key={c} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={c === value}
          aria-label={colorLabel(c)} title={colorLabel(c)} tabIndex={i === selected ? 0 : -1} data-color={c}
          onClick={() => onChange(c)} onKeyDown={(e) => onKeyDown(e, i)}
          className={cx(
            "h-8 w-8 rounded-full border-2 border-(--block-stripe) bg-(--block-fill) transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
            c === value && "ring-2 ring-foreground ring-offset-2 ring-offset-surface",
          )} />
      ))}
    </div>
  );
}
