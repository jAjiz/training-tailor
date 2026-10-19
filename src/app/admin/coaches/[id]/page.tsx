import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireAdminPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { getCoachDetail } from "@/lib/training/services/admin-queries";
import { CoachActions } from "../../AdminActions";
import { CoachStatusTag, Facts, formatDate, PageHeader, Tag, td, th, theadClasses } from "../../ui";

export default async function AdminCoachPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const coach = await orNotFound(getCoachDetail(prisma, id));
  const [t, tp, locale] = await Promise.all([getTranslations("admin"), getTranslations("programs"), getLocale()]);
  const language = coach.locale === "es" || coach.locale === "en" ? t(`common.languages.${coach.locale}`) : t("common.noLanguage");
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={coach.displayName} back={{ href: "/admin/coaches", label: t("coach.back") }}>
        <CoachActions coach={{ id: coach.id, userId: coach.userId, name: coach.displayName, email: coach.email, status: coach.status }} />
      </PageHeader>
      <Card>
        <Facts items={[
          { label: t("common.email"), value: coach.email },
          { label: t("common.status"), value: <CoachStatusTag status={coach.status} /> },
          { label: t("common.signedUp"), value: formatDate(coach.createdAt, locale) },
          { label: t("common.language"), value: language },
          { label: t("audit.title"), value: <Link href={`/admin/audit?user=${coach.userId}`} className="underline underline-offset-2">{t("common.viewAudit")}</Link> },
        ]} />
        {coach.athleteId && (
          <p className="border-t px-6 py-3 text-sm">
            <Link href={`/admin/athletes/${coach.athleteId}`} className="font-medium underline underline-offset-2">{t("coach.athleteProfile")}</Link>
          </p>
        )}
      </Card>
      <h2 className="text-lg font-bold">{t("coach.programsTitle")}</h2>
      {coach.programs.length === 0 ? <EmptyState>{t("coach.noPrograms")}</EmptyState> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className={theadClasses}>
              <tr>
                <th scope="col" className={th}>{t("coach.program")}</th>
                <th scope="col" className={th}>{t("coach.kind")}</th>
                <th scope="col" className={`${th} text-right`}>{t("coach.athletes")}</th>
                <th scope="col" className={th}>{t("coach.lastWeek")}</th>
                <th scope="col" className={th}>{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {coach.programs.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className={`${td} font-semibold`}>{p.name}</td>
                  <td className={`${td} text-muted`}>{p.kind === "closed" || p.kind === "continuous" ? tp(`kinds.${p.kind}`) : p.kind}</td>
                  <td className={`${td} text-right tabular-nums`}>{p.athletes}</td>
                  <td className={`${td} text-muted`}>{p.lastPublishedWeek === null ? "—" : t("coach.week", { week: p.lastPublishedWeek + 1 })}</td>
                  <td className={td}>
                    {p.archivedAt ? <Tag color="neutral">{t("coach.archived")}</Tag>
                      : p.kind === "closed" && !p.publishedAt ? <Tag color="yellow">{t("coach.unpublished")}</Tag>
                      : <Tag color="green">{t("coach.published")}</Tag>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
