"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
    <form onSubmit={save} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        {t("me.displayName")}
        <input className="rounded border px-3 py-2" value={form.displayName} maxLength={60}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("me.timezone")}
        <select className="rounded border px-3 py-2" value={form.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
          {timeZones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("me.language")}
        <select className="rounded border px-3 py-2" value={form.locale}
          onChange={(e) => setForm({ ...form, locale: e.target.value as Settings["locale"] })}>
          <option value="es">{t("me.languages.es")}</option>
          <option value="en">{t("me.languages.en")}</option>
        </select>
      </label>
      <button disabled={state === "saving"} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
        {state === "saving" ? t("common.saving") : t("common.save")}
      </button>
      {state === "saved" && <p className="text-sm text-green-700">{t("me.saved")}</p>}
      {state !== "idle" && state !== "saving" && state !== "saved" && <p className="text-sm text-red-700">{t(`errors.${state}`)}</p>}
    </form>
  );
}
