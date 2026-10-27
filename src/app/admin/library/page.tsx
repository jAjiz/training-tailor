import { getLocale, getTranslations } from "next-intl/server";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireAdminPage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { libraryOverview, readDraft } from "@/lib/training/services/library";
import { PageHeader, formatDate } from "../ui";
import { DiscardButton, ImportForm, PublishForm } from "./LibraryActions";
import { LibraryTabs } from "./LibraryTabs";

export default async function AdminLibraryPage() {
  await requireAdminPage();
  const [{ live, draft: draftSummary, lastExportedAt }, draft, t, locale] = await Promise.all([
    libraryOverview(prisma), readDraft(prisma), getTranslations("admin.library"), getLocale(),
  ]);
  const needsExport = live?.publishedAt != null && (lastExportedAt === null || lastExportedAt < live.publishedAt);
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t("title")}>
        <Button href="/admin/library/versions" variant="secondary" size="sm">{t("versionsLink")}</Button>
      </PageHeader>

      <LibraryTabs />

      {needsExport && <p role="status" className="rounded-xl bg-surface-2 p-4 text-sm">{t("exportReminder")}</p>}

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{t("live")}</h2>
        {live ? (
          <>
            <p className="font-medium">{t("version", { number: live.number })}</p>
            <p className="text-sm text-muted">{live.publishedAt && t("published", { date: formatDate(live.publishedAt, locale) })}</p>
            <p className="text-sm">{live.note ?? t("noNote")}</p>
            <div><a href={`/admin/library/export/${live.number}`} download className={buttonClasses({ variant: "secondary", size: "sm" })}>{t("exportLive")}</a></div>
          </>
        ) : <p className="text-sm text-muted">{t("noLive")}</p>}
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-semibold">{t("draft")}</h2>
        {draft && draftSummary ? (
          <>
            <div className="flex flex-col gap-1">
              <p className="font-medium">{t("version", { number: draft.number })}</p>
              <p className="text-sm text-muted">{draft.basedOnNumber === null ? t("basedOnNone") : t("basedOn", { number: draft.basedOnNumber })}</p>
              <p className="text-sm text-muted">{t("lastEdit", { date: formatDate(draftSummary.createdAt, locale) })}</p>
            </div>
            <h3 className="text-base font-semibold">{t("publishTitle")}</h3>
            <PublishForm key={draft.revision} revision={draft.revision} />
            <div><DiscardButton /></div>
          </>
        ) : <p className="text-sm text-muted">{t("noDraft")}</p>}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{t("importTitle")}</h2>
        <ImportForm />
      </Card>
    </section>
  );
}
