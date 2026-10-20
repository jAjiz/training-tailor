"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { deletePushSubscriptionAction } from "@/app/(athlete)/notification-actions";
import { authClient } from "@/lib/auth-client";

/** Removes this device's push subscription so a shared phone stops receiving the previous user's notifications. Never throws. */
async function dropPushSubscription(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return;
    await deletePushSubscriptionAction(subscription.endpoint);
    await subscription.unsubscribe();
  } catch {
    // Sign-out always proceeds.
  }
}

export function useSignOut(to = "/signin") {
  const router = useRouter();
  return async () => {
    await dropPushSubscription();
    await authClient.signOut();
    router.push(to);
    router.refresh();
  };
}

export function SignOutButton({ to = "/signin" }: { to?: string }) {
  const t = useTranslations("auth");
  const signOut = useSignOut(to);
  return (
    <Button type="button" variant="ghost" block onClick={() => void signOut()}>
      <LogOut size={18} aria-hidden />
      {t("signOut")}
    </Button>
  );
}
