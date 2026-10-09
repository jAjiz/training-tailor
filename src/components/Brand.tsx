import { cx } from "@/components/ui/cx";

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-extrabold tracking-tight", className)}>
      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs text-on-primary">TT</span>
      Training Tailor
    </span>
  );
}
