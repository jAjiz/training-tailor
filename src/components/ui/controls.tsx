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

export function Select({ compact, className, ...rest }: React.ComponentProps<"select"> & Compact) {
  return <select {...rest} className={cx(controlClasses(compact), className)} />;
}
