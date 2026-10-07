"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
    if (error) {
      setError("Google sign-in failed. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="text-sm text-neutral-600">
        Training Tailor adapts your programmed workout to today&apos;s body, time and equipment.
      </p>
      <button onClick={signIn} disabled={pending}
        className="rounded bg-black px-4 py-3 text-white disabled:opacity-50">
        {pending ? "Redirecting…" : "Continue with Google"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
