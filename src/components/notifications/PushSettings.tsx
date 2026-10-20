"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { deletePushSubscriptionAction } from "@/app/(athlete)/notification-actions";
import type { ErrorCode } from "@/lib/training/errors";
import { currentSubscription, permissionState, pushSupported, subscribeThisDevice, vapidPublicKey } from "./push-client";

type State = "loading" | "unsupported" | "denied" | "on" | "off";

async function detect(): Promise<Exclude<State, "loading">> {
  if (!vapidPublicKey() || !pushSupported()) return "unsupported";
  if (permissionState() === "denied") return "denied";
  return (await currentSubscription()) && permissionState() === "granted" ? "on" : "off";
}

/** Whether this device receives pushes, with turn-on and turn-off. */
export function PushSettings() {
  const t = useTranslations();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function refresh() {
    setState(await detect());
  }

  useEffect(() => {
    let alive = true;
    void detect().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission(); // First await: still inside the click gesture.
      if (permission === "granted") {
        const result = await subscribeThisDevice();
        if (!result.ok) setError(result.code);
      }
    } catch {
      setError("push_unavailable");
    }
    await refresh();
    setBusy(false);
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        const result = await deletePushSubscriptionAction(subscription.endpoint);
        if (!result.ok) setError(result.code);
        await subscription.unsubscribe();
      }
    } catch {
      setError("push_unavailable");
    }
    await refresh();
    setBusy(false);
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{t("notifications.pushTitle")}</h2>
      <Card className="flex flex-col gap-3 p-4">
        {state === "loading" && <p className="text-sm text-muted">…</p>}
        {state === "unsupported" && <p className="text-sm text-muted">{t("notifications.unsupported")}</p>}
        {state === "denied" && <p className="text-sm text-muted">{t("notifications.denied")}</p>}
        {(state === "on" || state === "off") && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">{state === "on" ? t("notifications.pushOn") : t("notifications.pushOff")}</p>
            <Button type="button" size="sm" variant={state === "on" ? "secondary" : "primary"} disabled={busy}
              onClick={() => void (state === "on" ? turnOff() : turnOn())}>
              {state === "on" ? t("notifications.turnOff") : t("notifications.turnOn")}
            </Button>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
      </Card>
    </section>
  );
}
