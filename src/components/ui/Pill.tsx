import { cx } from "./cx";

export type PillTone = "neutral" | "success" | "inverted";
const TONES: Record<PillTone, string> = {
  neutral: "bg-surface-2 text-muted",
  success: "bg-success/15 text-success",
  inverted: "bg-primary text-on-primary",
};

export function Pill({ tone = "neutral", className, children }: { tone?: PillTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Navigation pill: the active one inverted, like Strivee's top navigation. */
export const navPillClasses = (active: boolean): string =>
  cx("rounded-full px-4 py-1.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-foreground",
    active ? "bg-primary text-on-primary" : "text-muted hover:bg-surface-2 hover:text-foreground");

/** Toggle chip for multi-select options. */
export const chipClasses = (on: boolean): string =>
  cx("rounded-full px-3 py-1.5 text-sm font-medium transition disabled:opacity-50",
    on ? "bg-primary text-on-primary" : "bg-surface-2 text-foreground hover:brightness-95 dark:hover:brightness-125");
