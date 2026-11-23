"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { ErrorCode } from "@/lib/training/errors";
import { checkoutAction, joinProgramAction } from "../../actions";

export function JoinButton({ code }: { code: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function join() {
    setPending(true);
    const r = await joinProgramAction(code);
    if (r.ok) {
      router.push(`/?program=${r.value.programId}`);
    } else {
      setError(r.code);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="primary" block slanted onClick={join} disabled={pending}>{t("join.join")}</Button>
      {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
    </div>
  );
}

/** Codes that mean the coach cannot take payments right now, which the athlete sees as "temporarily unavailable". */
const UNAVAILABLE: ErrorCode[] = ["stripe_not_ready", "payments_unavailable"];

/** The paid variant: opens Stripe Checkout for the program ("Subscribe" for continuous, "Pay" for closed). */
export function CheckoutButton({ programId, subscription }: { programId: string; subscription: boolean }) {
  const t = useTranslations();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function pay() {
    setPending(true);
    setError(null);
    const r = await checkoutAction(programId);
    if (r.ok) {
      window.location.assign(r.value.url); // stays pending while the browser leaves for Checkout
    } else {
      setError(r.code);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="primary" block slanted onClick={pay} disabled={pending}>
        {t(subscription ? "join.subscribe" : "join.pay")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {UNAVAILABLE.includes(error) ? t("join.paymentsUnavailable") : t(`errors.${error}`)}
        </p>
      )}
      {!error && <p className="text-center text-xs text-muted">{t("join.secure")}</p>}
    </div>
  );
}
