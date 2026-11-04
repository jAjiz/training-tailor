import { cx } from "./cx";

type Props = React.HTMLAttributes<HTMLElement> & { as?: "div" | "article" | "section" | "li"; stripe?: boolean };

const STRIPE = "relative pl-3 before:absolute before:inset-y-0 before:left-0 before:w-3 before:rounded-l-2xl before:bg-(--block-stripe) before:[clip-path:polygon(0_0,100%_0,45%_100%,0_100%)]";

/** Rounded surface. No padding except the stripe's: callers set it. `stripe` draws a tapering block color on the left (set data-color). */
export function Card({ as: Tag = "div", stripe = false, className, ...rest }: Props) {
  return (
    <Tag {...rest} className={cx("rounded-2xl border bg-surface", stripe && STRIPE, className)} />
  );
}
