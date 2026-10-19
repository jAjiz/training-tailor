import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { navPillClasses } from "@/components/ui/Pill";
import { requireAdminPage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { listCoaches } from "@/lib/training/services/admin-queries";
import { COACH_STATUSES, listHref, parseListParams } from "../params";
import { CoachStatusTag, formatDate, PageHeader, Pagination, SearchForm, td, th, theadClasses } from "../ui";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminCoachesPage({ searchParams }: Props) {
  await requireAdminPage();
  const { search, status, page } = parseListParams(await searchParams);
  const [{ rows, hasMore }, t, locale] = await Promise.all([
    listCoaches(prisma, { search, status, page }), getTranslations("admin"), getLocale(),
  ]);
  const filters = [{ value: undefined, label: t("coaches.all") }, ...COACH_STATUSES.map((s) => ({ value: s, label: t(`coaches.statusFilters.${s}`) }))];
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t("coaches.title")}>
        <SearchForm action="/admin/coaches" search={search} placeholder={t("common.searchPlaceholder")} keep={{ status }} />
      </PageHeader>
      <nav aria-label={t("coaches.filter")}>
        <ul className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <li key={f.label}>
              <Link href={listHref("/admin/coaches", { search, status: f.value })} aria-current={status === f.value ? "page" : undefined}
                className={navPillClasses(status === f.value)}>{f.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      {rows.length === 0 ? <EmptyState>{t("coaches.empty")}</EmptyState> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className={theadClasses}>
              <tr>
                <th scope="col" className={th}>{t("common.name")}</th>
                <th scope="col" className={th}>{t("common.email")}</th>
                <th scope="col" className={th}>{t("common.status")}</th>
                <th scope="col" className={`${th} text-right`}>{t("coaches.programs")}</th>
                <th scope="col" className={th}>{t("common.signedUp")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t hover:bg-surface-2/60">
                  <td className={td}>
                    <Link href={`/admin/coaches/${c.id}`} className="font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-foreground">{c.displayName}</Link>
                  </td>
                  <td className={`${td} text-muted`}>{c.email}</td>
                  <td className={td}><CoachStatusTag status={c.status} /></td>
                  <td className={`${td} text-right tabular-nums`}>{c.programs}</td>
                  <td className={`${td} text-muted`}>{formatDate(c.createdAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination path="/admin/coaches" query={{ search, status }} page={page} hasMore={hasMore} />
    </section>
  );
}
