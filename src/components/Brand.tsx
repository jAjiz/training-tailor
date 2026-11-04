import { cx } from "@/components/ui/cx";
import { LOGO_BACK_PATH, LOGO_FRONT_PATH, LOGO_VIEWBOX } from "./logo-paths";

/** The logo on no background. On navy chrome it is always white and cyan; elsewhere it follows the theme. */
export function Logo({ onChrome = false, className }: { onChrome?: boolean; className?: string }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} aria-hidden className={cx("shrink-0", className ?? "size-8")}>
      <path d={LOGO_BACK_PATH} className={onChrome ? "fill-accent" : "fill-logo-back"} />
      <path d={LOGO_FRONT_PATH} className={onChrome ? "fill-on-chrome" : "fill-logo-front"} />
    </svg>
  );
}

export function Brand({ className, onChrome = false, size = "md", compactWordmark = false }: {
  className?: string;
  onChrome?: boolean;
  size?: "md" | "lg";
  /** Keeps only the logo on narrow screens; the name stays for screen readers. */
  compactWordmark?: boolean;
}) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <Logo onChrome={onChrome} className={size === "lg" ? "size-14" : "size-8"} />
      <span className={cx("type-display", compactWordmark && "max-sm:sr-only")}>Training Tailor</span>
    </span>
  );
}
