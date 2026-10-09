import Link from "next/link";
import { cx } from "./cx";

const BASE = "inline-flex shrink-0 items-center justify-center text-muted transition hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-foreground";

// Sizes are exclusive classes: without a class merger, a later h-7 would not reliably beat h-9.
const SIZES = { sm: "h-7 w-7 rounded-lg", md: "h-9 w-9 rounded-xl" } as const;

type Common = { label: string; size?: keyof typeof SIZES; className?: string; children: React.ReactNode };
type AsButton = Common & Omit<React.ComponentProps<"button">, "aria-label" | "className" | "children"> & { href?: undefined };
type AsLink = Common & { href: string };

/** Square icon-only control; `label` is its accessible name and tooltip. */
export function IconButton(props: AsButton | AsLink) {
  if (props.href !== undefined) {
    return (
      <Link href={props.href} aria-label={props.label} title={props.label} className={cx(BASE, SIZES[props.size ?? "md"], props.className)}>
        {props.children}
      </Link>
    );
  }
  const { label, size = "md", className, children, ...button } = props;
  return (
    <button type="button" aria-label={label} title={label} {...button} className={cx(BASE, SIZES[size], className)}>
      {children}
    </button>
  );
}
