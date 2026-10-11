"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cx } from "@/components/ui/cx";
import { toggleFistBumpAction } from "../../../result-actions";

export function FistBumpButton({ resultId, initialCount, initialBumped, disabled }: {
  resultId: string; initialCount: number; initialBumped: boolean; disabled: boolean;
}) {
  const t = useTranslations("leaderboard");
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [bumped, setBumped] = useState(initialBumped);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      const r = await toggleFistBumpAction(resultId);
      if (r.ok) {
        setCount(r.value.count);
        setBumped(r.value.bumped);
      } else {
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button onClick={toggle} disabled={disabled || pending} aria-pressed={disabled ? undefined : bumped}
      aria-label={count > 0 ? `${t("fistBump")} (${count})` : t("fistBump")}
      className={cx(
        "flex h-9 min-w-9 items-center justify-center gap-1 rounded-full px-2.5 text-sm font-semibold tabular-nums transition",
        "focus-visible:outline-2 focus-visible:outline-foreground disabled:opacity-50",
        bumped ? "bg-foreground/15 text-foreground" : "text-muted hover:bg-surface-2",
      )}>
      <span aria-hidden>👊</span>{count > 0 && count}
    </button>
  );
}
