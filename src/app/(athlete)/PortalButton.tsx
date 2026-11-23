"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { ErrorCode } from "@/lib/training/errors";
import { openPortalAction } from "./actions";

/** Opens the Stripe Customer Portal for the athlete's subscription to the program (card, cancellation, invoices). */
export function PortalButton({ programId, label, primary = false }: { programId: string; label: string; primary?: boolean }) {
  const t = useTranslations();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function open() {
    setPending(true);
    setError(null);
    const r = await openPortalAction(programId);
    if (r.ok) {
      window.location.assign(r.value.url); // stays pending while the browser leaves for the portal
    } else {
      setError(r.code);
      setPending(false);
    }
  }

  return (
    <div className={primary ? "flex flex-col gap-2" : "flex flex-col items-end gap-1"}>
      <Button
        type="button" variant={primary ? "primary" : "secondary"} size={primary ? "md" : "sm"} block={primary} slanted={primary}
        onClick={open} disabled={pending}
      >
        {label}
      </Button>
      {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
    </div>
  );
}
