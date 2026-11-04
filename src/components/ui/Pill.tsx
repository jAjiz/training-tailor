import { cx } from "./cx";

export type PillTone = "neutral" | "success" | "inverted";
const TONES: Record<PillTone, string> = {
  neutral: "bg-surface-2 text-muted",
  success: "bg-success/15 text-success",
  inverted: "bg-primary text-on-primary",
};

export function Pill({ tone = "neutral", className, children }: { tone?: PillTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Navigation pill: the active one inverted. */
export const navPillClasses = (active: boolean): string =>
  cx("rounded-md px-4 py-1.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-foreground",
    active ? "bg-primary text-on-primary" : "text-muted hover:bg-surface-2 hover:text-foreground");

/** Navigation item on the navy bar: the active one is a slanted cyan label. */
export const chromeNavClasses = (active: boolean): string =>
  cx("slant whitespace-nowrap px-3 py-1.5 text-sm font-semibold [--slant-focus:var(--on-chrome)]",
    active ? "text-on-accent before:bg-accent" : "text-on-chrome/80 hover:text-on-chrome hover:before:bg-white/10");

/** Toggle chip for multi-select options. */
export const chipClasses = (on: boolean): string =>
  cx("rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50",
    on ? "bg-primary text-on-primary" : "bg-surface-2 text-foreground hover:brightness-95 dark:hover:brightness-125");
