import { cx } from "./cx";

type Props = React.HTMLAttributes<HTMLElement> & { as?: "div" | "article" | "section" | "li"; stripe?: boolean };

/** Rounded surface. No padding: callers set it. `stripe` draws the block color on the left (set data-color). */
export function Card({ as: Tag = "div", stripe = false, className, ...rest }: Props) {
  return (
    <Tag {...rest} className={cx("rounded-2xl border bg-surface", stripe && "border-l-4 border-l-(--block-stripe)", className)} />
  );
}
