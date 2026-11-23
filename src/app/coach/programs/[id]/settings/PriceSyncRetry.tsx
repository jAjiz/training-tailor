"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { ErrorCode } from "@/lib/training/errors";
import { syncSubscriptionPricesAction } from "../../../program-actions";

/** Subscriptions Stripe has not moved to the program's new price yet, with a button to try again. */
export function PriceSyncRetry({ programId, count }: { programId: string; count: number }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ErrorCode | null>(null);

  function retry() {
    setError(null);
    startTransition(async () => {
      const r = await syncSubscriptionPricesAction(programId);
      if (!r.ok) setError(r.code);
      router.refresh();
    });
  }

  return (
    <div role="alert" data-color="red"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-(--block-fill) px-4 py-3 text-sm text-(--block-ink)">
      <span>{t("programs.price.syncPending", { count })}</span>
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={retry}>{t("coach.payments.retry")}</Button>
      {error && <span className="w-full">{t(`errors.${error}`)}</span>}
    </div>
  );
}
