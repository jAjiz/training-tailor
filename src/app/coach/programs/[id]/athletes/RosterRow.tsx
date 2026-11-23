"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cx } from "@/components/ui/cx";
import { Pill } from "@/components/ui/Pill";
import { removeAthleteAction, restoreAthleteAction } from "../../../roster-actions";

/** An active athlete's access to a paid program; `leavingOn` when their subscription is set to end. */
export type RosterAccess = { access: "free" | "paid" | "granted" | "blocked"; leavingOn: string | null };

type Props = {
  enrollmentId: string; name: string; joined: string; removed: boolean; leftOn: string | null; resultsHref: string;
  /** Whether the Access column is shown (paid programs); `access` is null in it for athletes who left or were removed. */
  showAccess: boolean; access: RosterAccess | null;
};

export function RosterRow({ enrollmentId, name, joined, removed, leftOn, resultsHref, showAccess, access }: Props) {
  const t = useTranslations("roster");
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function toggle() {
    const message = access?.access === "paid" ? t("removeConfirmPaid") : t("removeConfirm");
    if (!removed && !(await confirm({ title: t("removeTitle", { name }), message, confirmLabel: t("remove") }))) return;
    const r = removed ? await restoreAthleteAction(enrollmentId) : await removeAthleteAction(enrollmentId);
    if (r.ok) router.refresh();
  }

  return (
    <tr className={cx("border-t", (removed || leftOn) && "opacity-60")}>
      <td className="px-4 py-3">
        <span className="flex items-center gap-3"><Avatar name={name} /><span className="font-semibold">{name}</span></span>
      </td>
      <td className="px-4 py-3 text-muted">{joined}</td>
      <td className="px-4 py-3">{leftOn ? (
          <span className="flex flex-col items-start gap-1"><Pill tone="neutral">{t("leftBadge")}</Pill><span className="text-xs text-muted">{t("leftOn", { date: leftOn })}</span></span>
        ) : (
          <Pill tone={removed ? "neutral" : "success"}>{removed ? t("removedBadge") : t("activeBadge")}</Pill>
        )}</td>
      {showAccess && (
        <td className="px-4 py-3">{access && (
          <span className="flex flex-col items-start gap-1">
            <Pill tone={access.access === "blocked" ? "neutral" : "success"}>{t(`accessLabels.${access.access}`)}</Pill>
            {access.leavingOn && <span className="text-xs text-muted">{t("leavingOn", { date: access.leavingOn })}</span>}
          </span>
        )}</td>
      )}
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
