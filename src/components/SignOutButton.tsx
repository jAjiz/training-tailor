"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button className="text-neutral-600 underline" onClick={async () => {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    }}>
      Sign out
    </button>
  );
}
