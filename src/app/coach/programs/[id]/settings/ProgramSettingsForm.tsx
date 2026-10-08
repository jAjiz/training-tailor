"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
    <div className="flex max-w-lg flex-col gap-6">
      <form onSubmit={save} className="flex flex-col gap-4">
        <fieldset disabled={archived} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t("programs.name")}
            <input required maxLength={80} className="rounded border px-3 py-2" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("programs.description")}
            <textarea maxLength={500} className="rounded border px-3 py-2" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          {kind === "continuous" ? (
            <label className="flex flex-col gap-1 text-sm">
              {t("programs.startDate")}
              <input type="date" step={7} disabled={startDateLocked} className="rounded border px-3 py-2"
                value={form.startDate ?? ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              {startDateLocked && <span className="text-xs text-neutral-500">{t("programs.startDateLockedHint")}</span>}
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              {t("programs.weeks")}
              <input type="number" min={1} max={52} className="rounded border px-3 py-2" value={form.weeks}
                onChange={(e) => setForm({ ...form, weeks: e.target.value })} />
            </label>
          )}
          <button className="w-fit rounded bg-black px-4 py-2 text-white">{t("common.save")}</button>
        </fieldset>
        {state === "saved" && <p className="text-sm text-green-700">{t("me.saved")}</p>}
        {state !== "idle" && state !== "saving" && state !== "saved" && <p className="text-sm text-red-700">{t(`errors.${state}`)}</p>}
      </form>
      {!archived && (
        <button onClick={archive} className="w-fit text-sm text-red-700 underline">{t("programs.archive")}</button>
      )}
    </div>
  );
}
