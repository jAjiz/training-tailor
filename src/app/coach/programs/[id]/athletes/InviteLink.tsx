"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/controls";
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
    <Card className="flex flex-col gap-3 p-5">
      <span className="text-sm font-semibold">{t("roster.inviteLink")}</span>
      <div className="flex flex-wrap items-center gap-2">
        <Input readOnly value={url} aria-label={t("roster.inviteLink")} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 font-mono" />
        <Button type="button" variant="primary" onClick={copy}>
          {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
          {copied ? t("roster.copied") : t("roster.copy")}
        </Button>
        {!readOnly && (
          <Button type="button" variant="ghost" onClick={regenerate}><RefreshCw size={16} aria-hidden />{t("roster.regenerate")}</Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
    </Card>
  );
}
