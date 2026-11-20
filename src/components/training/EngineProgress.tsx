"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, LoaderCircle } from "lucide-react";
import type { ProgressStage } from "@/lib/engine/pipeline";

const STEPS = ["read", "adapt", "check"] as const;
const STEP_OF: Record<ProgressStage, number> = { analyzing: 0, tailoring: 1, validating: 2, retrying: 2 };
// Past this the athlete gets a line saying the model is still working.
const SLOW_SECONDS = 25;

/**
 * The model's side of the conversation while a run is in flight: what it is doing now, the steps of the run and the
 * seconds since it started. Mounted for the whole run, so the count survives stage changes.
 */
export function EngineProgress({ stage }: { stage: ProgressStage }) {
  const t = useTranslations("adapt");
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const current = STEP_OF[stage];

  return (
    <section aria-label={t("working")} className="flex flex-col gap-3 rounded-xl border bg-surface p-3">
      <div role="status" aria-live="polite" className="flex items-center gap-2">
        <LoaderCircle size={18} aria-hidden className="shrink-0 animate-spin text-accent-ink motion-reduce:animate-none" />
        <p className="text-[15px] font-medium">{t(`stage.${stage}`)}</p>
        <span className="ml-auto text-xs tabular-nums text-muted" aria-hidden>{`${seconds} s`}</span>
      </div>
      <ol className="flex flex-col gap-1.5 text-sm">
        {STEPS.map((s, i) => {
          const state = i < current ? "done" : i === current ? "active" : "pending";
          return (
            <li key={s} data-state={state} aria-current={state === "active" ? "step" : undefined}
              className={`flex items-center gap-2 ${state === "pending" ? "text-muted" : ""}`}>
              <span aria-hidden className="flex size-4 items-center justify-center">
                {state === "done" ? <Check size={14} className="text-accent-ink" />
                  : <span className={`size-2 rounded-full ${state === "active" ? "bg-accent animate-pulse motion-reduce:animate-none" : "bg-surface-2"}`} />}
              </span>
              {t(`steps.${s}`)}
            </li>
          );
        })}
      </ol>
      <div aria-hidden className="flex flex-col gap-2">
        <div className="h-3 w-3/4 rounded bg-surface-2 animate-pulse motion-reduce:animate-none" />
        <div className="h-3 w-1/2 rounded bg-surface-2 animate-pulse motion-reduce:animate-none" />
      </div>
      <p className="text-xs text-muted">{seconds >= SLOW_SECONDS ? t("slowHint") : t("waitHint")}</p>
    </section>
  );
}
