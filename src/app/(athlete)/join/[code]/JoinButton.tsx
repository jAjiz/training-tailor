"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
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
      <Button type="button" variant="primary" block onClick={join} disabled={pending}>{t("join.join")}</Button>
      {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
    </div>
  );
}
