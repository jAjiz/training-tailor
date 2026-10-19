import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireAdminPage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { getOverview } from "@/lib/training/services/admin-queries";
import { PageHeader } from "./ui";

export default async function AdminOverviewPage() {
  await requireAdminPage();
  const [o, t, locale] = await Promise.all([getOverview(prisma), getTranslations("admin.overview"), getLocale()]);
  const n = new Intl.NumberFormat(locale);
  const figures = [
    { label: t("approvedCoaches"), value: o.approvedCoaches },
    { label: t("athletes"), value: o.athletes },
    { label: t("activePrograms"), value: o.activePrograms },
    { label: t("results7d"), value: o.resultsLast7Days },
  ];
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t("title")} />
      {/* The only figure that asks for action. */}
      {o.pendingCoaches > 0 ? (
        <div data-color="yellow" className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-(--block-fill) px-6 py-6 text-(--block-ink)">
          <p className="flex items-baseline gap-3">
            <span className="text-5xl font-extrabold tabular-nums tracking-tight">{n.format(o.pendingCoaches)}</span>
            <span className="text-lg font-semibold">{t("pending", { count: o.pendingCoaches })}</span>
          </p>
          <Button href="/admin/coaches?status=pending" variant="primary">{t("review")}</Button>
        </div>
      ) : (
        <Card className="px-6 py-5 text-[15px] text-muted">{t("pendingNone")}</Card>
      )}
      <Card as="section" className="grid grid-cols-2 divide-y sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {figures.map((f) => (
          <div key={f.label} className="flex flex-col gap-1 px-6 py-5">
            <span className="text-3xl font-bold tabular-nums">{n.format(f.value)}</span>
            <span className="text-sm text-muted">{f.label}</span>
          </div>
        ))}
      </Card>
    </section>
  );
}
