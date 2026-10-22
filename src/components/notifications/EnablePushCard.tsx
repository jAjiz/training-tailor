"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { installPlatform } from "@/lib/notifications/install";
import type { ErrorCode } from "@/lib/training/errors";
import { currentSubscription, dismissPushCard, isStandalone, permissionState, pushCardDismissed, pushSupported, subscribeThisDevice, vapidPublicKey } from "./push-client";

const subscribeNever = () => () => {};

function canOffer(): boolean {
  // Phones outside the installed app are the install gate's business; desktop and the installed app get the card.
  const desktopOrInstalled = isStandalone() || installPlatform(navigator.userAgent) === "other";
  // "granted" too: after a sign-out the subscription is gone but the browser keeps the permission.
  const permission = permissionState();
  return Boolean(vapidPublicKey()) && pushSupported() && (permission === "default" || permission === "granted") && desktopOrInstalled && !pushCardDismissed();
}

/** First-open invitation to turn notifications on. The permission prompt only ever appears from the button's click handler (iOS needs the gesture). */
export function EnablePushCard() {
  const t = useTranslations();
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  // False on the server and during hydration, then the browser's answer.
  const eligible = useSyncExternalStore(subscribeNever, canOffer, () => false);
  // null until known: the card only shows once we know this device has no subscription.
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void currentSubscription().then((s) => {
      if (live) setSubscribed(s !== null);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!eligible || closed || subscribed !== false) return null;

  function dismiss() {
    dismissPushCard();
    setClosed(true);
  }

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      // Must be the first await of the click: the browser only allows the prompt inside the gesture.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setClosed(true); // Denied or dismissed: the card moves to /me.
        return;
      }
      const result = await subscribeThisDevice();
      if (result.ok) setClosed(true);
      else setError(result.code);
    } catch {
      setError("push_unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <Bell size={22} aria-hidden className="mt-0.5 shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{t("notifications.enableTitle")}</p>
          <p className="text-sm text-muted">{t("notifications.enableBody")}</p>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="primary" disabled={busy} onClick={() => void enable()}>
          {busy ? t("notifications.working") : t("notifications.enable")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={dismiss}>{t("notifications.dismiss")}</Button>
      </div>
    </Card>
  );
}
