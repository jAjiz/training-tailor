"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { ErrorCode } from "@/lib/training/errors";
import { completeAthleteOnboarding } from "../actions";

export function OnboardingRunner({ next }: { next: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState<ErrorCode | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    completeAthleteOnboarding({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        router.replace(next);
        router.refresh();
      } else {
        setError(r.code);
      }
    });
    return () => { cancelled = true; };
  }, [next, router, attempt]);

  if (!error) return <p role="status" className="py-16 text-center text-muted">{t("onboarding.preparing")}</p>;
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p role="alert" className="text-danger">{t(`errors.${error}`)}</p>
      <Button type="button" onClick={() => { setError(null); setAttempt((a) => a + 1); }}>{t("onboarding.retry")}</Button>
    </div>
  );
}
