"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/controls";
import { DatePicker } from "@/components/ui/DatePicker";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { isMonday } from "@/lib/training/dates";
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
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-2 lg:gap-x-8">
      <Field label={t("programs.kind")} hint={t(`programs.kindHelp.${kind}`)} group>
        <Segmented label={t("programs.kind")} value={kind} onChange={setKind}
          options={(["continuous", "closed"] as const).map((k) => ({ value: k, label: t(`programs.kinds.${k}`) }))} />
      </Field>
      <Field label={t("programs.name")}>
        <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("programs.description")} className="lg:col-span-2">
        <Textarea rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {kind === "continuous" ? (
        <Field label={t("programs.startDate")}>
          <DatePicker min={nextMonday} allow={isMonday} value={startDate} onChange={setStartDate} />
        </Field>
      ) : (
        <Field label={t("programs.weeks")}>
          <Input type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
        </Field>
      )}
      {error && <p role="alert" className="text-sm text-danger lg:col-span-2">{t(`errors.${error}`)}</p>}
      <Button type="submit" variant="primary" disabled={pending} className="lg:col-span-2 lg:justify-self-start">{t("programs.create")}</Button>
    </form>
  );
}
