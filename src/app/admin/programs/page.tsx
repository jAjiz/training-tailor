import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireAdminPage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { listPrograms } from "@/lib/training/services/admin-queries";
import { ProgramActions } from "../AdminActions";
import { parseListParams } from "../params";
import { PageHeader, Pagination, SearchForm, Tag, td, th, theadClasses } from "../ui";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminProgramsPage({ searchParams }: Props) {
  await requireAdminPage();
  const { search, page } = parseListParams(await searchParams);
  const [{ rows, hasMore }, t, tp] = await Promise.all([
    listPrograms(prisma, { search, page }), getTranslations("admin"), getTranslations("programs"),
  ]);
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t("programs.title")}>
        <SearchForm action="/admin/programs" search={search} placeholder={t("programs.searchPlaceholder")} />
      </PageHeader>
      {rows.length === 0 ? <EmptyState>{t("programs.empty")}</EmptyState> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className={theadClasses}>
              <tr>
                <th scope="col" className={th}>{t("coach.program")}</th>
                <th scope="col" className={th}>{t("programs.coach")}</th>
                <th scope="col" className={th}>{t("programs.kind")}</th>
                <th scope="col" className={`${th} text-right`}>{t("programs.athletes")}</th>
                <th scope="col" className={th}>{t("programs.lastWeek")}</th>
                <th scope="col" className={th}>{t("programs.invite")}</th>
                <th scope="col" className={th}><span className="sr-only">{t("programs.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t align-top">
                  <td className={td}>
                    <span className="flex flex-col gap-1">
                      <span className="font-semibold">{p.name}</span>
                      {p.archivedAt && <span><Tag color="neutral">{t("programs.archived")}</Tag></span>}
                    </span>
                  </td>
                  <td className={td}>
                    {p.coachId
                      ? <Link href={`/admin/coaches/${p.coachId}`} className="underline-offset-2 hover:underline">{p.coachName}</Link>
                      : <span className="flex flex-col"><span className="text-muted">{p.coachName}</span><span className="text-xs text-muted">{t("programs.deletedCoach")}</span></span>}
                  </td>
                  <td className={`${td} text-muted`}>{p.kind === "closed" || p.kind === "continuous" ? tp(`kinds.${p.kind}`) : p.kind}</td>
                  <td className={`${td} text-right tabular-nums`}>{p.activeAthletes}</td>
                  <td className={`${td} text-muted`}>{p.lastPublishedWeek === null ? "—" : t("coach.week", { week: p.lastPublishedWeek + 1 })}</td>
                  <td className={td}>
                    {!p.coachId ? "—" : p.inviteDisabledAt ? <Tag color="red">{t("programs.inviteOff")}</Tag> : <Tag color="green">{t("programs.inviteOn")}</Tag>}
                  </td>
                  <td className={td}>
                    {p.coachId && <ProgramActions program={{ id: p.id, name: p.name, inviteDisabled: p.inviteDisabledAt !== null }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination path="/admin/programs" query={{ search }} page={page} hasMore={hasMore} />
    </section>
  );
}
