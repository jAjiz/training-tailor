"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ErrorCode } from "@/lib/training/errors";
import { regenerateInviteAction } from "../../../program-actions";

export function InviteLink({ programId, url, readOnly }: { programId: string; url: string; readOnly: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function regenerate() {
    if (!window.confirm(t("roster.regenerateConfirm"))) return;
    const r = await regenerateInviteAction(programId);
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t("roster.inviteLink")}</span>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-neutral-100 px-2 py-1 text-sm">{url}</code>
        <button onClick={copy} className="text-sm underline">{copied ? t("roster.copied") : t("roster.copy")}</button>
        {!readOnly && <button onClick={regenerate} className="text-sm underline">{t("roster.regenerate")}</button>}
      </div>
      {error && <p className="text-sm text-red-700">{t(`errors.${error}`)}</p>}
    </div>
  );
}
