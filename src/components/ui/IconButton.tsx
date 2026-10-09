import Link from "next/link";
import { cx } from "./cx";

const BASE = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-foreground";

type Common = { label: string; className?: string; children: React.ReactNode };
type AsButton = Common & Omit<React.ComponentProps<"button">, "aria-label" | "className" | "children"> & { href?: undefined };
type AsLink = Common & { href: string };

/** Square icon-only control; `label` is its accessible name and tooltip. */
export function IconButton(props: AsButton | AsLink) {
  if (props.href !== undefined) {
    return (
      <Link href={props.href} aria-label={props.label} title={props.label} className={cx(BASE, props.className)}>
        {props.children}
      </Link>
    );
  }
  const { label, className, children, ...button } = props;
  return (
    <button type="button" aria-label={label} title={label} {...button} className={cx(BASE, className)}>
      {children}
    </button>
  );
}
