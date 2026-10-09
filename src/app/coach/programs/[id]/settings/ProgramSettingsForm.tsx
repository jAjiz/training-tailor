"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import type { ErrorCode } from "@/lib/training/errors";
import { archiveProgramAction, updateProgramAction } from "../../../program-actions";

type Props = {
  programId: string;
  kind: "continuous" | "closed";
  initial: { name: string; description: string; startDate: string | null; weeks: number | null };
  startDateLocked: boolean;
  archived: boolean;
};

export function ProgramSettingsForm({ programId, kind, initial, startDateLocked, archived }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [form, setForm] = useState({ ...initial, weeks: String(initial.weeks ?? "") });
  const [state, setState] = useState<"idle" | "saving" | "saved" | ErrorCode>("idle");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    const program = kind === "continuous"
      ? { name: form.name, description: form.description, startDate: form.startDate ?? undefined }
      : { name: form.name, description: form.description, weeks: Number(form.weeks) };
    const r = await updateProgramAction({ programId, program });
    setState(r.ok ? "saved" : r.code);
    if (r.ok) router.refresh();
  }

  async function archive() {
    if (!window.confirm(t("programs.archiveConfirm"))) return;
    const r = await archiveProgramAction(programId);
    if (r.ok) router.push("/coach");
    else setState(r.code);
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={save} className="flex flex-col gap-5">
        <fieldset disabled={archived} className="grid gap-5 lg:grid-cols-2 lg:gap-x-8">
          <Field label={t("programs.name")}>
            <Input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t("programs.description")} className="lg:order-last lg:col-span-2">
            <Textarea rows={3} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          {kind === "continuous" ? (
            <Field label={t("programs.startDate")} hint={startDateLocked ? t("programs.startDateLockedHint") : null}>
              <Input type="date" step={7} disabled={startDateLocked} value={form.startDate ?? ""}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </Field>
          ) : (
            <Field label={t("programs.weeks")}>
              <Input type="number" min={1} max={52} value={form.weeks} onChange={(e) => setForm({ ...form, weeks: e.target.value })} />
            </Field>
          )}
          <Button type="submit" variant="primary" className="justify-self-start lg:order-last lg:col-span-2" disabled={state === "saving"}>{t("common.save")}</Button>
        </fieldset>
        {state === "saved" && <p role="status" className="text-sm text-success">{t("me.saved")}</p>}
        {state !== "idle" && state !== "saving" && state !== "saved" && <p role="alert" className="text-sm text-danger">{t(`errors.${state}`)}</p>}
      </form>
      {!archived && (
        <div className="border-t pt-6">
          <Button type="button" variant="danger" onClick={archive}>{t("programs.archive")}</Button>
        </div>
      )}
    </div>
  );
}
