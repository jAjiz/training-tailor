import { getLocale, getTranslations } from "next-intl/server";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireAdminPage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { listVersions } from "@/lib/training/services/library";
import { PageHeader, Tag, formatDate, td, th, theadClasses } from "../../ui";
import { RestoreButton } from "../LibraryActions";

const STATE_COLOR = { live: "green", draft: "yellow", archived: "neutral" } as const;

export default async function AdminLibraryVersionsPage() {
  await requireAdminPage();
  const [versions, t, locale] = await Promise.all([listVersions(prisma), getTranslations("admin.library"), getLocale()]);
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t("versionsTitle")} back={{ href: "/admin/library", label: t("back") }} />
      {versions.length === 0 ? <EmptyState>{t("versions.empty")}</EmptyState> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className={theadClasses}>
              <tr>
                <th scope="col" className={th}>{t("versions.number")}</th>
                <th scope="col" className={th}>{t("versions.state")}</th>
                <th scope="col" className={th}>{t("versions.date")}</th>
                <th scope="col" className={th}>{t("versions.note")}</th>
                <th scope="col" className={th}><span className="sr-only">{t("versions.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-t align-top">
                  <td className={`${td} font-semibold tabular-nums`}>{v.number}</td>
                  <td className={td}><Tag color={STATE_COLOR[v.state]}>{t(`versions.${v.state}`)}</Tag></td>
                  <td className={`${td} text-muted`}>{v.publishedAt ? formatDate(v.publishedAt, locale) : t("versions.unpublished")}</td>
                  <td className={td}>{v.note ?? "—"}</td>
                  <td className={td}>
                    <span className="flex flex-wrap items-center gap-2">
                      {v.state !== "draft" && <RestoreButton number={v.number} />}
                      <a href={`/admin/library/export/${v.number}`} download className={buttonClasses({ variant: "ghost", size: "sm" })}>{t("export")}</a>
                    </span>
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
