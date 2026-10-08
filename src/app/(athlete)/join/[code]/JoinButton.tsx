"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ErrorCode } from "@/lib/training/errors";
import { joinProgramAction } from "../../actions";

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
      <button onClick={join} disabled={pending} className="rounded bg-black px-4 py-3 text-white disabled:opacity-50">{t("join.join")}</button>
      {error && <p className="text-sm text-red-700">{t(`errors.${error}`)}</p>}
    </div>
  );
}
