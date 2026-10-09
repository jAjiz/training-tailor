"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ErrorCode } from "@/lib/training/errors";
import { enterCoach } from "../onboarding-actions";

export function CoachOnboardingRunner() {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState<ErrorCode | null>(null);

  useEffect(() => {
    let cancelled = false;
    enterCoach().then((r) => {
      if (cancelled) return;
      if (!r.ok) return setError(r.code);
      router.replace(r.value.status === "approved" ? "/coach" : "/coach/pending");
      router.refresh();
    });
    return () => { cancelled = true; };
  }, [router]);

  return error
    ? <p role="alert" className="py-16 text-center text-danger">{t(`errors.${error}`)}</p>
    : <p role="status" className="py-16 text-center text-muted">{t("onboarding.preparing")}</p>;
}
