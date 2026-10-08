"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ to = "/signin" }: { to?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  return (
    <button className="text-neutral-600 underline" onClick={async () => {
      await authClient.signOut();
      router.push(to);
      router.refresh();
    }}>
      {t("signOut")}
    </button>
  );
}
