import { ChevronDown } from "lucide-react";
import { cx } from "./cx";

/** Filled control (Strivee's Workout Log): no visible border until focus. No width: Field stretches it. */
export function controlClasses(compact = false): string {
  return cx(
    "rounded-xl bg-surface-2 text-foreground outline-none ring-1 ring-transparent transition placeholder:text-muted focus:ring-foreground disabled:opacity-50",
    compact ? "px-2.5 py-1.5 text-sm" : "px-4 py-3 text-[15px]",
  );
}

type Compact = { compact?: boolean };

export function Input({ compact, className, ...rest }: React.ComponentProps<"input"> & Compact) {
  return <input {...rest} className={cx(controlClasses(compact), className)} />;
}

export function Textarea({ compact, className, ...rest }: React.ComponentProps<"textarea"> & Compact) {
  return <textarea {...rest} className={cx(controlClasses(compact), "leading-relaxed", className)} />;
}

/** Native arrow hidden: ours sits inside the padding, like the inputs' text, instead of flush with the edge. */
export function Select({ compact, className, ...rest }: React.ComponentProps<"select"> & Compact) {
  return (
    <span className={cx("relative grid", className)}>
      <select {...rest} className={cx(controlClasses(compact), "peer w-full appearance-none", compact ? "pr-8" : "pr-11")} />
      <ChevronDown size={compact ? 14 : 16} aria-hidden
        className={cx("pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted peer-disabled:opacity-50", compact ? "right-2.5" : "right-4")} />
    </span>
  );
}
