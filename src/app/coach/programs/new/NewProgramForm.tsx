"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ErrorCode } from "@/lib/training/errors";
import { createProgramAction } from "../../program-actions";

export function NewProgramForm({ nextMonday }: { nextMonday: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [kind, setKind] = useState<"continuous" | "closed">("continuous");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(nextMonday);
  const [weeks, setWeeks] = useState("4");
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const input = kind === "continuous"
      ? { kind, name, description, startDate }
      : { kind, name, description, weeks: Number(weeks) };
    const r = await createProgramAction(input);
    setPending(false);
    if (r.ok) router.push(`/coach/programs/${r.value.id}`);
    else setError(r.code);
  }

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t("programs.kind")}</legend>
        {(["continuous", "closed"] as const).map((k) => (
          <label key={k} className="flex items-start gap-2 text-sm">
            <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
            <span><b>{t(`programs.kinds.${k}`)}</b> — {t(`programs.kindHelp.${k}`)}</span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        {t("programs.name")}
        <input required maxLength={80} className="rounded border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("programs.description")}
        <textarea maxLength={500} className="rounded border px-3 py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {kind === "continuous" ? (
        <label className="flex flex-col gap-1 text-sm">
          {t("programs.startDate")}
          <input type="date" step={7} min={nextMonday} className="rounded border px-3 py-2" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          {t("programs.weeks")}
          <input type="number" min={1} max={52} className="rounded border px-3 py-2" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
        </label>
      )}
      <button disabled={pending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">{t("programs.create")}</button>
      {error && <p className="text-sm text-red-700">{t(`errors.${error}`)}</p>}
    </form>
  );
}
