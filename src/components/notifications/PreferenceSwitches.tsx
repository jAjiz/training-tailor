"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import type { NotificationKind } from "@/lib/notifications/kinds";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";

type Props = {
  initial: Partial<Record<NotificationKind, boolean>>;
  /** The zone's own `setPreferenceAction`. */
  save: (kind: NotificationKind, enabled: boolean) => Promise<ActionResult>;
};

/** One on/off switch per notification kind of the zone. Off means no push and no inbox entry. */
export function PreferenceSwitches({ initial, save }: Props) {
  const t = useTranslations("notifications");
  const te = useTranslations("errors");
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function toggle(kind: NotificationKind, enabled: boolean) {
    const before = values[kind] ?? true;
    setValues((v) => ({ ...v, [kind]: enabled }));
    setError(null);
    const r = await save(kind, enabled).catch((): ActionResult => ({ ok: false, code: "internal" }));
    if (!r.ok) {
      setValues((v) => ({ ...v, [kind]: before }));
      setError(r.code);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{t("prefsTitle")}</h2>
      <p className="text-sm text-muted">{t("prefsHint")}</p>
      <Card className="divide-y">
        {(Object.keys(values) as NotificationKind[]).map((kind) => (
          <label key={kind} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
            <span className="text-[15px]">{t(`prefs.${kind}`)}</span>
            <input type="checkbox" role="switch" checked={values[kind] ?? true} onChange={(e) => void toggle(kind, e.target.checked)}
              className="size-5 shrink-0 accent-primary" />
          </label>
        ))}
      </Card>
      {error && <p role="alert" className="text-sm text-danger">{te(error)}</p>}
    </section>
  );
}
