import { getTranslations } from "next-intl/server";
import { cx } from "./cx";

const bar = "rounded-lg bg-surface-2 animate-pulse motion-reduce:animate-none";

/** Placeholder shown while a page's server data loads: a title and a few cards (`cards`) or table rows (`rows`). */
export async function PageSkeleton({ variant }: { variant: "cards" | "rows" }) {
  const t = await getTranslations("common");
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-5">
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden className="flex flex-col gap-2">
        <div className={cx(bar, "h-8 w-2/3 max-w-sm")} />
        <div className={cx(bar, "h-4 w-1/3 max-w-48")} />
      </div>
      {variant === "cards" ? (
        <div aria-hidden className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-2xl border bg-surface p-4">
              <div className={cx(bar, "h-5 w-1/2")} />
              <div className={cx(bar, "h-4 w-full")} />
              <div className={cx(bar, "h-4 w-4/5")} />
            </div>
          ))}
        </div>
      ) : (
        <div aria-hidden className="overflow-hidden rounded-2xl border bg-surface">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={cx("flex items-center gap-4 px-4 py-3", i > 0 && "border-t")}>
              <div className={cx(bar, "h-4 w-1/4")} />
              <div className={cx(bar, "h-4 flex-1")} />
              <div className={cx(bar, "h-4 w-16")} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
