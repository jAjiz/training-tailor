"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cx } from "@/components/ui/cx";
import { Pill } from "@/components/ui/Pill";
import { removeAthleteAction, restoreAthleteAction } from "../../../roster-actions";

type Props = { enrollmentId: string; name: string; joined: string; removed: boolean; resultsHref: string };

export function RosterRow({ enrollmentId, name, joined, removed, resultsHref }: Props) {
  const t = useTranslations("roster");
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function toggle() {
    if (!removed && !(await confirm({ title: t("removeTitle", { name }), message: t("removeConfirm"), confirmLabel: t("remove") }))) return;
    const r = removed ? await restoreAthleteAction(enrollmentId) : await removeAthleteAction(enrollmentId);
    if (r.ok) router.refresh();
  }

  return (
    <tr className={cx("border-t", removed && "opacity-60")}>
      <td className="px-4 py-3">
        <span className="flex items-center gap-3"><Avatar name={name} /><span className="font-semibold">{name}</span></span>
      </td>
      <td className="px-4 py-3 text-muted">{joined}</td>
      <td className="px-4 py-3"><Pill tone={removed ? "neutral" : "success"}>{removed ? t("removedBadge") : t("activeBadge")}</Pill></td>
      <td className="px-4 py-3">
        <span className="flex justify-end gap-2">
          <Button href={resultsHref} variant="ghost" size="sm">{t("results")}</Button>
          <Button type="button" size="sm" variant={removed ? "secondary" : "danger"} onClick={toggle}>{removed ? t("restore") : t("remove")}</Button>
        </span>
        {dialog}
      </td>
    </tr>
  );
}
