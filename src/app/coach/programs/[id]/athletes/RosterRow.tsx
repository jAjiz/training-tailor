"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { removeAthleteAction, restoreAthleteAction } from "../../../roster-actions";

type Props = { enrollmentId: string; name: string; joined: string; removed: boolean; resultsHref: string };

export function RosterRow({ enrollmentId, name, joined, removed, resultsHref }: Props) {
  const t = useTranslations("roster");
  const router = useRouter();

  async function toggle() {
    if (!removed && !window.confirm(t("removeConfirm"))) return;
    const r = removed ? await restoreAthleteAction(enrollmentId) : await removeAthleteAction(enrollmentId);
    if (r.ok) router.refresh();
  }

  return (
    <li className={`flex items-center gap-4 border-b py-2 ${removed ? "opacity-60" : ""}`}>
      <span className="font-medium">{name}</span>
      <span className="text-sm text-neutral-500">{t("joined", { date: joined })}</span>
      {removed && <span className="rounded bg-neutral-200 px-2 text-xs">{t("removedBadge")}</span>}
      <a href={resultsHref} className="ml-auto text-sm underline">{t("results")}</a>
      <button onClick={toggle} className="text-sm underline">{removed ? t("restore") : t("remove")}</button>
    </li>
  );
}
