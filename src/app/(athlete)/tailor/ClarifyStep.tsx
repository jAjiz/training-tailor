"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { controlClasses } from "@/components/ui/controls";
import { MECHANISM_TEXT, type ClarifyAnswer } from "@/lib/engine/clarify";
import type { ClarifyQuestion } from "@/lib/engine/types";

export interface FreeTextAnswer {
  restriction: number;
  text: string;
}

interface Props {
  questions: ClarifyQuestion[];
  allowFreeText: boolean; // false on the round after a free-text answer: it is re-analyzed only once
  busy: boolean;
  onSubmit: (answers: ClarifyAnswer[], freeText: FreeTextAnswer[]) => void;
  onCancel: () => void;
}

// A site question: tick the kinds of load that bother it, or one of the whole-site answers.
type SiteState = { mode: "pick" | "all" | "none" | "other"; picked: number[]; text: string };

const field = controlClasses(true);
const where = (site: string, side: string | null) => `${side && side !== "both" ? `${side} ` : ""}${site.replaceAll("_", " ")}`;

/** Asked only when the athlete's words leave the scope open; every answer bans exactly what was chosen. */
export function ClarifyStep({ questions, allowFreeText, busy, onSubmit, onCancel }: Props) {
  const [sites, setSites] = useState<Record<number, SiteState>>({});
  const [picks, setPicks] = useState<Record<number, string>>(() =>
    Object.fromEntries(questions.flatMap((q, i) => (q.kind === "replacement" ? [[i, q.preselected]] : []))));
  const site = (i: number): SiteState => sites[i] ?? { mode: "pick", picked: [], text: "" };
  const setSite = (i: number, patch: Partial<SiteState>) => setSites({ ...sites, [i]: { ...site(i), ...patch } });

  const answered = questions.every((q, i) => {
    if (q.kind === "replacement") return Boolean(picks[i]);
    const s = site(i);
    return s.mode === "pick" ? s.picked.length > 0 : s.mode === "other" ? s.text.trim() !== "" : true;
  });

  function submit() {
    const answers: ClarifyAnswer[] = [];
    const freeText: FreeTextAnswer[] = [];
    questions.forEach((q, i) => {
      if (q.kind === "replacement") {
        answers.push({ kind: "replacement", restriction: q.restriction, blockIndex: q.blockIndex, componentIndex: q.componentIndex, replacement: picks[i] });
        return;
      }
      const s = site(i);
      if (s.mode === "other") freeText.push({ restriction: q.restriction, text: s.text.trim() });
      else answers.push({
        kind: "site", restriction: q.restriction,
        mechanisms: s.mode === "pick" ? [...new Set(s.picked.flatMap((o) => q.options[o].mechanisms))] : s.mode,
      });
    });
    onSubmit(answers, freeText);
  }

  return (
    <section data-color="yellow" className="flex flex-col gap-3 rounded-xl bg-(--block-fill) p-3" aria-labelledby="clarify-heading">
      <h2 id="clarify-heading" className="font-semibold">One question before we tailor</h2>

      {questions.map((q, i) => q.kind === "site" ? (
        <fieldset key={i} className="flex flex-col gap-2 rounded-xl border bg-surface p-2 text-sm shadow-lg">
          <legend className="font-medium">What bothers your {where(q.site, q.side)} today?</legend>
          <p className="text-xs text-muted">&ldquo;{q.evidence}&rdquo;</p>
          {q.options.map((o, j) => (
            <label key={j} className="flex items-start gap-2">
              <input type="checkbox" checked={site(i).mode === "pick" && site(i).picked.includes(j)} onChange={(e) => setSite(i, {
                mode: "pick", picked: e.target.checked ? [...site(i).picked, j] : site(i).picked.filter((x) => x !== j),
              })} />
              <span>{o.label}: <span className="text-muted">{o.movements.join(", ")}</span></span>
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input type="radio" name={`site-${i}`} checked={site(i).mode === "all"} onChange={() => setSite(i, { mode: "all", picked: [] })} />
            Everything that loads my {where(q.site, null)}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={`site-${i}`} checked={site(i).mode === "none"} onChange={() => setSite(i, { mode: "none", picked: [] })} />
            I can do everything
          </label>
          {allowFreeText && (
            <>
              <label className="flex items-center gap-2">
                <input type="radio" name={`site-${i}`} checked={site(i).mode === "other"} onChange={() => setSite(i, { mode: "other", picked: [] })} />
                Something else…
              </label>
              {site(i).mode === "other" && (
                <textarea className={`${field} min-h-12`} value={site(i).text} onChange={(e) => setSite(i, { text: e.target.value })}
                  placeholder="e.g. only when I hang from the bar" />
              )}
            </>
          )}
        </fieldset>
      ) : (
        <fieldset key={i} className="flex flex-col gap-2 rounded-xl border bg-surface p-2 text-sm shadow-lg">
          <legend className="font-medium">Instead of {q.movement}?</legend>
          <p className="text-xs text-muted">The closest alternative also loads your {where(q.site, null)}.</p>
          {q.options.map((o) => (
            <label key={o.name} className="flex items-start gap-2">
              <input type="radio" name={`replacement-${i}`} checked={picks[i] === o.name} onChange={() => setPicks({ ...picks, [i]: o.name })} />
              <span>
                {o.name}
                {o.shared.length > 0 && (
                  <span className="text-(--block-ink)"> — also loads your {where(q.site, null)}: {o.shared.map((m) => MECHANISM_TEXT[m]).join(", ")}</span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      ))}

      <div className="flex gap-2">
        <button type="button" className={buttonClasses({ variant: "primary", size: "sm" })} disabled={busy || !answered} onClick={submit}>
          Continue
        </button>
        <button type="button" className={buttonClasses({ size: "sm" })} onClick={onCancel}>Back</button>
      </div>
    </section>
  );
}
