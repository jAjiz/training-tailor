"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export function GoogleSignInButton({ callbackURL }: { callbackURL: string }) {
  const t = useTranslations("auth");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL });
    if (error) {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={signIn} disabled={pending} className="rounded bg-black px-4 py-3 text-white disabled:opacity-50">
        {pending ? t("redirecting") : t("continueWithGoogle")}
      </button>
      {failed && <p className="text-sm text-red-700">{t("failed")}</p>}
    </div>
  );
}
