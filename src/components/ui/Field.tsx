import { cx } from "./cx";

type Props = {
  label: string;
  hint?: string | null;
  error?: string | null;
  /** For a control that names itself (Segmented, ColorSwatches): a <label> around it would forward clicks. */
  group?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** Label wrapping its control (implicit association, no ids needed), with optional hint and error below. */
export function Field({ label, hint, error, group = false, className, children }: Props) {
  const Wrapper = group ? "div" : "label";
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <Wrapper className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" aria-hidden={group || undefined}>{label}</span>
        {children}
      </Wrapper>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
