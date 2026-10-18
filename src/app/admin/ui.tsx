import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/controls";
import { cx } from "@/components/ui/cx";
import { listHref } from "./params";

export const th = "px-4 py-3";
export const td = "px-4 py-3";
export const theadClasses = "bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted";

/** A date in the admin's language, UTC (sign-up dates, join dates). */
export function formatDate(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

export function PageHeader({ title, back, children }: { title: string; back?: { href: string; label: string }; children?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      {back && (
        <Link href={back.href} className="inline-flex w-fit items-center gap-1 rounded text-sm font-medium text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground">
          <ChevronLeft size={16} aria-hidden />{back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {children}
      </div>
    </header>
  );
}

/** Colored status tag: data-color picks the block palette, so it reads in both themes. */
export function Tag({ color, children }: { color: "yellow" | "green" | "red" | "neutral" | "blue"; children: React.ReactNode }) {
  return (
    <span data-color={color} className="inline-flex items-center whitespace-nowrap rounded-full bg-(--block-fill) px-2.5 py-0.5 text-xs font-semibold text-(--block-ink)">
      {children}
    </span>
  );
}

export const COACH_STATUS_COLOR = { pending: "yellow", approved: "green", rejected: "red", suspended: "neutral" } as const;

export async function CoachStatusTag({ status }: { status: string }) {
  const t = await getTranslations("admin.coaches.statuses");
  const known = status in COACH_STATUS_COLOR ? (status as keyof typeof COACH_STATUS_COLOR) : null;
  return <Tag color={known ? COACH_STATUS_COLOR[known] : "neutral"}>{known ? t(known) : status}</Tag>;
}

/** GET form: the search survives in the URL, so lists can be linked and paged. Hidden fields keep other filters. */
export async function SearchForm({ action, search, placeholder, keep = {} }: {
  action: string; search?: string; placeholder: string; keep?: Record<string, string | undefined>;
}) {
  const t = await getTranslations("admin.common");
  return (
    <form action={action} role="search" className="flex gap-2">
      {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <Input compact type="search" name="search" defaultValue={search} placeholder={placeholder} aria-label={placeholder} maxLength={100} className="w-64" />
      <Button type="submit" size="sm">{t("search")}</Button>
    </form>
  );
}

export async function Pagination({ path, query, page, hasMore }: {
  path: string; query: Record<string, string | undefined>; page: number; hasMore: boolean;
}) {
  if (page === 0 && !hasMore) return null;
  const t = await getTranslations("admin.common");
  const link = "rounded-xl px-3 py-1.5 text-sm font-semibold";
  return (
    <nav aria-label={t("pagination")} className="flex items-center justify-end gap-2">
      {page > 0
        ? <Button href={listHref(path, { ...query, page: page - 1 })} variant="ghost" size="sm">{t("prev")}</Button>
        : <span className={cx(link, "text-muted opacity-50")}>{t("prev")}</span>}
      <span className="px-2 text-sm tabular-nums text-muted">{page + 1}</span>
      {hasMore
        ? <Button href={listHref(path, { ...query, page: page + 1 })} variant="ghost" size="sm">{t("next")}</Button>
        : <span className={cx(link, "text-muted opacity-50")}>{t("next")}</span>}
    </nav>
  );
}

/** Label/value pairs of a detail page. */
export function Facts({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-4 px-6 py-5 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted">{i.label}</dt>
          <dd className="break-words text-[15px] font-medium">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
