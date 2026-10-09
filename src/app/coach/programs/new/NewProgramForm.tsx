"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
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
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field label={t("programs.kind")} hint={t(`programs.kindHelp.${kind}`)} group>
        <Segmented label={t("programs.kind")} value={kind} onChange={setKind}
          options={(["continuous", "closed"] as const).map((k) => ({ value: k, label: t(`programs.kinds.${k}`) }))} />
      </Field>
      <Field label={t("programs.name")}>
        <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("programs.description")}>
        <Textarea rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {kind === "continuous" ? (
        <Field label={t("programs.startDate")}>
          <Input type="date" step={7} min={nextMonday} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
      ) : (
        <Field label={t("programs.weeks")}>
          <Input type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
        </Field>
      )}
      {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
      <Button type="submit" variant="primary" disabled={pending}>{t("programs.create")}</Button>
    </form>
  );
}
