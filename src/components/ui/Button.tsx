import Link from "next/link";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "tinted";
export type ButtonSize = "sm" | "md";
type Look = { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string };

const BASE = "inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:opacity-90",
  secondary: "bg-surface-2 text-foreground hover:brightness-95 dark:hover:brightness-125",
  ghost: "text-foreground hover:bg-surface-2",
  danger: "text-danger ring-1 ring-inset ring-danger/40 hover:bg-danger/10",
  // Inside an element with data-color: the block's ink on its fill (Strivee's "Coaching Tips" / "Log Result").
  tinted: "bg-(--block-fill) text-(--block-ink) hover:brightness-95 dark:hover:brightness-125",
};
const SIZES: Record<ButtonSize, string> = { sm: "h-9 px-3 text-sm", md: "h-12 px-5 text-[15px]" };

export function buttonClasses({ variant = "secondary", size = "md", block = false, className }: Look = {}): string {
  return cx(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className);
}

type AsButton = Look & Omit<React.ComponentProps<"button">, "className"> & { href?: undefined };
type AsLink = Look & Omit<React.ComponentProps<typeof Link>, "className">;

/** A button, or a link that looks like one when `href` is set. Native `type` semantics (submit by default inside forms). */
export function Button(props: AsButton | AsLink) {
  if (props.href !== undefined) {
    const { variant, size, block, className, ...link } = props;
    return <Link {...link} className={buttonClasses({ variant, size, block, className })} />;
  }
  const { variant, size, block, className, ...button } = props;
  return <button {...button} className={buttonClasses({ variant, size, block, className })} />;
}
