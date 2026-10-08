"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

  if (!error) return <p className="py-12 text-center text-neutral-600">{t("onboarding.preparing")}</p>;
  return (
    <div className="flex flex-col gap-3 py-12">
      <p className="text-red-700">{t(`errors.${error}`)}</p>
      <button className="w-fit underline" onClick={() => { setError(null); setAttempt((a) => a + 1); }}>
        {t("onboarding.retry")}
      </button>
    </div>
  );
}
