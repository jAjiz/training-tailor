"use client";

import { useEffect } from "react";
import { savePushSubscriptionAction } from "@/app/(athlete)/notification-actions";
import { currentSubscription, permissionState } from "./push-client";

/** On a shared device the previous user's subscription may still be there: re-save it so it belongs to whoever is signed in now. Renders nothing; errors are ignored. */
export function PushResync() {
  useEffect(() => {
    void (async () => {
      try {
        if (permissionState() !== "granted") return;
        const json = (await currentSubscription())?.toJSON();
        if (!json?.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
        await savePushSubscriptionAction({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
      } catch {
        // Best effort: nothing to show.
      }
    })();
  }, []);
  return null;
}
