import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireAdminPage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { listAudit } from "@/lib/training/services/audit";
import { parseAuditParams } from "../params";
import { PageHeader, Pagination, Tag, td, th, theadClasses } from "../ui";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const KNOWN_ACTIONS = [
  "coach.approve", "coach.reject", "coach.suspend", "coach.enable", "coach.delete",
  "athlete.disable", "athlete.enable", "athlete.delete",
  "program.invite_disable", "program.invite_enable", "program.regenerate_invite",
  "impersonation.start", "impersonation.stop", "impersonation.failed", "admin.grant",
] as const;

function detailsText(details: unknown): string {
  if (!details || typeof details !== "object") return "—";
  return Object.entries(details as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join(", ") || "—";
}

export default async function AdminAuditPage({ searchParams }: Props) {
  await requireAdminPage();
  const { user, action, page } = parseAuditParams(await searchParams);
  const [{ rows, hasMore }, t, locale] = await Promise.all([
    listAudit(prisma, { targetUserId: user, action, page }), getTranslations("admin.audit"), getLocale(),
  ]);
  // Actor and target are shown by email; a deleted user falls back to the label kept on the row, or the id.
  const userIds = [...new Set(rows.flatMap((r) => [r.actorUserId, r.targetUserId].filter((id): id is string => id !== null)))];
  const emails = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }))
    .map((u) => [u.id, u.email]));
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  const label = (a: string) => ((KNOWN_ACTIONS as readonly string[]).includes(a) ? t(`actions.${a}` as `actions.coach.approve`) : a);
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t("title")}>
        <form action="/admin/audit" role="search" className="flex flex-wrap items-center gap-2">
          <Input compact name="action" list="audit-actions" defaultValue={action} placeholder={t("filterAction")} aria-label={t("filterAction")} maxLength={64} className="w-56" />
          <datalist id="audit-actions">{KNOWN_ACTIONS.map((a) => <option key={a} value={a}>{label(a)}</option>)}</datalist>
          <Input compact name="user" defaultValue={user} placeholder={t("filterUser")} aria-label={t("filterUser")} maxLength={64} className="w-56" />
          <Button type="submit" size="sm">{t("filter")}</Button>
        </form>
      </PageHeader>
      {rows.length === 0 ? <EmptyState>{t("empty")}</EmptyState> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className={theadClasses}>
              <tr>
                <th scope="col" className={th}>{t("when")}</th>
                <th scope="col" className={th}>{t("actor")}</th>
                <th scope="col" className={th}>{t("action")}</th>
                <th scope="col" className={th}>{t("target")}</th>
                <th scope="col" className={th}>{t("details")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className={`${td} whitespace-nowrap tabular-nums text-muted`}>{when.format(r.createdAt)}</td>
                  <td className={td}>{r.actorUserId ? emails.get(r.actorUserId) ?? r.actorUserId : t("script")}</td>
                  <td className={td}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{label(r.action)}</span>
                      {r.impersonating && <Tag color="blue">{t("impersonating")}</Tag>}
                    </span>
                  </td>
                  <td className={td}>
                    <span className="flex flex-col">
                      <span>{r.targetLabel ?? (r.targetUserId ? emails.get(r.targetUserId) ?? r.targetUserId : "—")}</span>
                      {r.targetType && <span className="text-xs text-muted">{r.targetType}</span>}
                    </span>
                  </td>
                  <td className={`${td} text-muted`}>{detailsText(r.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination path="/admin/audit" query={{ user, action }} page={page} hasMore={hasMore} />
    </section>
  );
}
