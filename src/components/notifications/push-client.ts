"use client";

import { savePushSubscriptionAction } from "@/app/(athlete)/notification-actions";
import type { ErrorCode } from "@/lib/training/errors";

// Browser-only helpers. Every access to a browser API is guarded: on the server or in an unsupported browser they report "no" instead of throwing.

const PUSH_CARD_DISMISSED_KEY = "tt:push-card-dismissed";

/** Whether the athlete said no to the "Turn on notifications" card on this device. */
export function pushCardDismissed(): boolean {
  try {
    return localStorage.getItem(PUSH_CARD_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Keeps the card away (dismissed, or push turned off in /me). Storage blocked: the card simply comes back. */
export function dismissPushCard(): void {
  try {
    localStorage.setItem(PUSH_CARD_DISMISSED_KEY, "1");
  } catch {
    // ignore
  }
}

export const vapidPublicKey = (): string | null => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;

export function pushSupported(): boolean {
  try {
    return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  } catch {
    return false;
  }
}

export function permissionState(): NotificationPermission | null {
  try {
    return typeof Notification === "undefined" ? null : Notification.permission;
  } catch {
    return null;
  }
}

export function isStandalone(): boolean {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

function toKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** This device's push subscription, or null. Never throws. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    if (!pushSupported()) return null;
    const registration = await navigator.serviceWorker.getRegistration("/");
    return (await registration?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/** Call from a click handler, after permission is granted. */
export async function subscribeThisDevice(): Promise<{ ok: true } | { ok: false; code: ErrorCode }> {
  const key = vapidPublicKey();
  if (!key || !pushSupported()) return { ok: false, code: "push_unavailable" };
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = (await registration.pushManager.getSubscription())
      ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return { ok: false, code: "push_unavailable" };
    const saved = await savePushSubscriptionAction({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
    return saved.ok ? { ok: true } : saved;
  } catch {
    return { ok: false, code: "push_unavailable" };
  }
}
