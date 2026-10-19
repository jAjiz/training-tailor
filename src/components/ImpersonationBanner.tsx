"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { stopImpersonatingAction } from "@/app/admin/actions";
import type { ErrorCode } from "@/lib/training/errors";

/** Across the top of both zones while the admin is inside someone's account. */
export function ImpersonationBanner({ name }: { name: string }) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ErrorCode | null>(null);
  // On success the action redirects to /admin; it only returns when the exit was refused.
  const exit = () => startTransition(async () => {
    setError(null);
    const r = await stopImpersonatingAction();
    if (!r.ok) setError(r.code);
  });
  return (
    <div role="status" data-color="yellow"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-(--block-fill) px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-sm text-(--block-ink)">
      <span className="font-medium">{t("impersonation.viewing", { name })}</span>
      <button type="button" disabled={pending} onClick={exit}
        className="rounded-lg px-3 py-1 font-semibold underline underline-offset-2 hover:bg-black/5 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-current dark:hover:bg-white/10">
        {pending ? t("impersonation.exiting") : t("impersonation.exit")}
      </button>
      {error && <p role="alert" className="w-full text-center font-medium text-danger">{t(`errors.${error}`)}</p>}
    </div>
  );
}
