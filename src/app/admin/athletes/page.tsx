import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireAdminPage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { listAthletes } from "@/lib/training/services/admin-queries";
import { parseListParams } from "../params";
import { formatDate, PageHeader, Pagination, SearchForm, Tag, td, th, theadClasses } from "../ui";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminAthletesPage({ searchParams }: Props) {
  await requireAdminPage();
  const { search, page } = parseListParams(await searchParams);
  const [{ rows, hasMore }, t, locale] = await Promise.all([
    listAthletes(prisma, { search, page }), getTranslations("admin"), getLocale(),
  ]);
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t("athletes.title")}>
        <SearchForm action="/admin/athletes" search={search} placeholder={t("common.searchPlaceholder")} />
      </PageHeader>
      {rows.length === 0 ? <EmptyState>{t("athletes.empty")}</EmptyState> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className={theadClasses}>
              <tr>
                <th scope="col" className={th}>{t("common.name")}</th>
                <th scope="col" className={th}>{t("common.email")}</th>
                <th scope="col" className={th}>{t("common.status")}</th>
                <th scope="col" className={`${th} text-right`}>{t("athletes.enrollments")}</th>
                <th scope="col" className={th}>{t("common.signedUp")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t hover:bg-surface-2/60">
                  <td className={td}>
                    <Link href={`/admin/athletes/${a.id}`} className="font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-foreground">{a.displayName}</Link>
                  </td>
                  <td className={`${td} text-muted`}>{a.email}</td>
                  <td className={td}>
                    {a.disabledAt ? <Tag color="neutral">{t("athletes.disabled")}</Tag> : <Tag color="green">{t("athletes.active")}</Tag>}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{a.enrollments}</td>
                  <td className={`${td} text-muted`}>{formatDate(a.createdAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination path="/admin/athletes" query={{ search }} page={page} hasMore={hasMore} />
    </section>
  );
}
