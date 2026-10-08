import { cx } from "./cx";

type Props = { label: string; hint?: string | null; error?: string | null; className?: string; children: React.ReactNode };

/** Label wrapping its control (implicit association, no ids needed), with optional hint and error below. */
export function Field({ label, hint, error, className, children }: Props) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        {children}
      </label>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
