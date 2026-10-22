"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import type { ErrorCode } from "@/lib/training/errors";
import { leaveProgramAction } from "../actions";

export function MyPrograms({ programs }: { programs: { id: string; name: string }[] }) {
  const t = useTranslations();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [error, setError] = useState<ErrorCode | null>(null);

  async function leave(p: { id: string; name: string }) {
    if (!(await confirm({ title: t("me.leaveTitle", { name: p.name }), message: t("me.leaveConfirm"), confirmLabel: t("me.leave") }))) return;
    const r = await leaveProgramAction(p.id);
    if (r.ok) {
      setError(null);
      router.refresh();
    } else {
      setError(r.code);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{t("me.programsTitle")}</h2>
      {programs.length === 0 ? <p className="text-sm text-muted">{t("me.noPrograms")}</p> : (
        <Card className="divide-y">
          {programs.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="font-semibold">{p.name}</span>
              <Button type="button" size="sm" variant="danger" onClick={() => leave(p)}>{t("me.leave")}</Button>
            </div>
          ))}
        </Card>
      )}
      {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
      {dialog}
    </section>
  );
}
