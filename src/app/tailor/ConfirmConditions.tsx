"use client";

import { useState } from "react";
import { Severity, Side } from "@/lib/domain/types";
import type { ConfirmedCondition } from "@/lib/engine/types";

export interface CatalogEntry {
  key: string;
  label: string;
  kind: string; // "injury" | "limitation" | "condition"
}

interface Props {
  suggested: ConfirmedCondition[];
  catalog: CatalogEntry[];
  busy: boolean;
  onConfirm: (confirmed: ConfirmedCondition[]) => void;
  onCancel: () => void;
}

const SEVERITY_TEXT: Record<Severity, string> = {
  mild: "Mild: a niggle, you can train almost normally",
  moderate: "Moderate: pain that limits some movements",
  acute: "Acute: a recent injury, sharp pain, or told to rest",
};

const field = "rounded border px-2 py-1 text-sm";

/** The athlete confirms what the analyzer read: severity decides what is allowed, so it is never applied unseen. */
export function ConfirmConditions({ suggested, catalog, busy, onConfirm, onCancel }: Props) {
  const [items, setItems] = useState<ConfirmedCondition[]>(suggested);
  const [adding, setAdding] = useState("");
  const entry = (key: string) => catalog.find((c) => c.key === key);
  const update = (i: number, patch: Partial<ConfirmedCondition>) =>
    setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <section className="flex flex-col gap-3 rounded border border-amber-300 bg-amber-50 p-3" aria-labelledby="confirm-heading">
      <h2 id="confirm-heading" className="font-semibold">Is this right?</h2>
      <p className="text-sm">We read this from what you wrote. Check the side and how bad it is: it decides what you can do today.</p>

      {items.map((c, i) => (
        <div key={c.key} className="flex flex-col gap-2 rounded border bg-white p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{entry(c.key)?.label ?? c.key}</span>
            <button type="button" className="text-sm underline" onClick={() => setItems(items.filter((_, j) => j !== i))}>remove</button>
          </div>
          {c.evidence && <p className="text-xs text-neutral-600">&ldquo;{c.evidence}&rdquo;</p>}
          {entry(c.key)?.kind === "injury" ? (
            <>
              <label className="flex items-center gap-2 text-sm">Side
                <select className={field} value={c.side ?? ""} onChange={(e) => update(i, { side: e.target.value === "" ? null : Side.parse(e.target.value) })}>
                  <option value="">not specific</option>
                  {Side.options.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <fieldset className="flex flex-col gap-1 text-sm">
                <legend className="sr-only">How bad is it?</legend>
                {Severity.options.map((s) => (
                  <label key={s} className="flex items-center gap-2">
                    <input type="radio" name={`severity-${c.key}`} checked={c.severity === s} onChange={() => update(i, { severity: s })} />
                    {SEVERITY_TEXT[s]}
                  </label>
                ))}
              </fieldset>
            </>
          ) : (
            <span className="text-sm text-neutral-600">always applies</span>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <select className={field} value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">add something we missed…</option>
          {catalog.filter((c) => !items.some((x) => x.key === c.key)).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button type="button" className="rounded border px-3 py-1 text-sm" disabled={!adding} onClick={() => {
          setItems([...items, { key: adding, side: null, severity: "moderate", evidence: null }]);
          setAdding("");
        }}>Add</button>
      </div>

      <div className="flex gap-2">
        <button type="button" className="rounded bg-black px-4 py-1 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => onConfirm(items)}>
          Continue
        </button>
        <button type="button" className="rounded border px-3 py-1 text-sm" onClick={onCancel}>Back</button>
      </div>
    </section>
  );
}
