"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { stopImpersonatingAction } from "@/app/admin/actions";

/** Across the top of both zones while the admin is inside someone's account. */
export function ImpersonationBanner({ name }: { name: string }) {
  const t = useTranslations("impersonation");
  const [pending, startTransition] = useTransition();
  return (
    <div role="status" data-color="yellow"
      className="flex items-center justify-center gap-4 bg-(--block-fill) px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-sm text-(--block-ink)">
      <span className="font-medium">{t("viewing", { name })}</span>
      <button type="button" disabled={pending} onClick={() => startTransition(async () => { await stopImpersonatingAction(); })}
        className="rounded-lg px-3 py-1 font-semibold underline underline-offset-2 hover:bg-black/5 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-current dark:hover:bg-white/10">
        {pending ? t("exiting") : t("exit")}
      </button>
    </div>
  );
}
