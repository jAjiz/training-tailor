import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireAdminPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { getAthleteDetail } from "@/lib/training/services/admin-queries";
import { AthleteActions } from "../../AdminActions";
import { Facts, formatDate, PageHeader, Tag, td, th, theadClasses } from "../../ui";

export default async function AdminAthletePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const athlete = await orNotFound(getAthleteDetail(prisma, id));
  const [t, locale] = await Promise.all([getTranslations("admin"), getLocale()]);
  const language = athlete.locale === "es" || athlete.locale === "en" ? t(`common.languages.${athlete.locale}`) : t("common.noLanguage");
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={athlete.displayName} back={{ href: "/admin/athletes", label: t("athlete.back") }}>
        <AthleteActions athlete={{
          id: athlete.id, userId: athlete.userId, name: athlete.displayName, email: athlete.email, disabled: athlete.disabledAt !== null,
        }} />
      </PageHeader>
      <Card>
        <Facts items={[
          { label: t("common.email"), value: athlete.email },
          { label: t("common.status"), value: athlete.disabledAt ? <Tag color="neutral">{t("athletes.disabled")}</Tag> : <Tag color="green">{t("athletes.active")}</Tag> },
          { label: t("common.signedUp"), value: formatDate(athlete.createdAt, locale) },
          { label: t("common.timezone"), value: athlete.timezone },
          { label: t("common.language"), value: language },
          { label: t("athlete.results"), value: <span className="tabular-nums">{athlete.results}</span> },
          { label: t("audit.title"), value: <Link href={`/admin/audit?user=${athlete.userId}`} className="underline underline-offset-2">{t("common.viewAudit")}</Link> },
        ]} />
        {athlete.coachId && (
          <p className="border-t px-6 py-3 text-sm">
            <Link href={`/admin/coaches/${athlete.coachId}`} className="font-medium underline underline-offset-2">{t("athlete.coachProfile")}</Link>
          </p>
        )}
      </Card>
      <h2 className="text-lg font-bold">{t("athlete.enrollmentsTitle")}</h2>
      {athlete.enrollments.length === 0 ? <EmptyState>{t("athlete.noEnrollments")}</EmptyState> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className={theadClasses}>
              <tr>
                <th scope="col" className={th}>{t("athlete.program")}</th>
                <th scope="col" className={th}>{t("athlete.coach")}</th>
                <th scope="col" className={th}>{t("athlete.joined")}</th>
                <th scope="col" className={th}>{t("athlete.removed")}</th>
              </tr>
            </thead>
            <tbody>
              {athlete.enrollments.map((e) => (
                <tr key={e.programId} className="border-t">
                  <td className={`${td} font-semibold`}>{e.programName}</td>
                  <td className={`${td} text-muted`}>{e.coachName}</td>
                  <td className={`${td} text-muted`}>{formatDate(e.joinedAt, locale)}</td>
                  <td className={`${td} text-muted`}>{e.removedAt ? formatDate(e.removedAt, locale) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
