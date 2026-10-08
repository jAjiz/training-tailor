"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import type { ErrorCode } from "@/lib/training/errors";
import { updateSettingsAction } from "../actions";

type Settings = { displayName: string; timezone: string; locale: "es" | "en" };

export function SettingsForm({ initial, timeZones }: { initial: Settings; timeZones: string[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | ErrorCode>("idle");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    const r = await updateSettingsAction(form);
    setState(r.ok ? "saved" : r.code);
    if (r.ok) router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <Field label={t("me.displayName")}>
        <Input value={form.displayName} maxLength={60} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      </Field>
      <Field label={t("me.timezone")}>
        <Select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
          {timeZones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </Select>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("me.language")}</span>
        <Segmented label={t("me.language")} value={form.locale} onChange={(locale) => setForm({ ...form, locale })}
          options={[{ value: "es", label: t("me.languages.es") }, { value: "en", label: t("me.languages.en") }]} />
      </div>
      <Button type="submit" variant="primary" block disabled={state === "saving"}>
        {state === "saving" ? t("common.saving") : t("common.save")}
      </Button>
      {state === "saved" && <p role="status" className="text-center text-sm text-success">{t("me.saved")}</p>}
      {state !== "idle" && state !== "saving" && state !== "saved" && <p role="alert" className="text-sm text-danger">{t(`errors.${state}`)}</p>}
    </form>
  );
}
