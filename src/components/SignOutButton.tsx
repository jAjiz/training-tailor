"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { authClient } from "@/lib/auth-client";

export function useSignOut(to = "/signin") {
  const router = useRouter();
  return async () => {
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
