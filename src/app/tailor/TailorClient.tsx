"use client";

import { useState } from "react";
import type { Equipment } from "@/lib/domain/types";
import type { ProgressStage } from "@/lib/engine/pipeline";
import {
  ManualWorkoutSchema,
  type ConfirmedCondition, type FeedbackAnalysis, type ManualWorkout, type PipelineResult, type TailorRequest,
  type WorkoutAnalysisResult,
} from "@/lib/engine/types";
import { readEngineOutcome } from "@/lib/engine-events";
import { ConfirmConditions, type CatalogEntry } from "./ConfirmConditions";
import { ManualEntryForm, emptyManualWorkout } from "./ManualEntryForm";
import { ResultView } from "./ResultView";

interface Props {
  movementNames: string[];
  equipmentOptions: Equipment[];
  catalog: CatalogEntry[];
}

// What phase 2 needs once the athlete has confirmed today's conditions.
type Pending =
  | { kind: "tailor"; analysis: WorkoutAnalysisResult; request: TailorRequest; suggested: ConfirmedCondition[] }
  | { kind: "refine"; previous: PipelineResult; feedback: string; unavailableEquipment: Equipment[]; request: TailorRequest; suggested: ConfirmedCondition[] };

const STAGE_TEXT: Record<ProgressStage, string> = {
  analyzing: "Reading the workout and your situation…",
  tailoring: "Tailoring the session…",
  validating: "Checking it against your conditions and equipment…",
  retrying: "Fixing what the check found…",
};

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "Your session expired. Sign in again.",
  invalid_request: "Something in the form is not valid.",
  payload_too_large: "That is too much text. Shorten the workout or start a new one.",
  quota_exceeded: "You reached today's limit. Try again tomorrow.",
  engine_unavailable: "The engine is not configured.",
  engine_failed: "The engine failed. Try again.",
  engine_unsafe: "We could not produce a modification that is safe for your conditions. Rephrase your situation, or check with a professional.",
};

const field = "rounded border px-2 py-1 text-sm";
const chip = (on: boolean) => `rounded border px-3 py-1 text-sm ${on ? "bg-black text-white" : ""}`;

export function TailorClient({ movementNames, equipmentOptions, catalog }: Props) {
  const conditionLabels = Object.fromEntries(catalog.map((c) => [c.key, c.label]));
  const [mode, setMode] = useState<"paste" | "manual">("paste");
  const [rawText, setRawText] = useState("");
  const [manual, setManual] = useState<ManualWorkout>(emptyManualWorkout());
  const [situation, setSituation] = useState("");
  const [timeCap, setTimeCap] = useState("");
  const [target, setTarget] = useState("");
  const [overrideEquipment, setOverrideEquipment] = useState(false);
  const [equipmentToday, setEquipmentToday] = useState<Equipment[]>([]);
  const [stage, setStage] = useState<ProgressStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [request, setRequest] = useState<TailorRequest | null>(null);
  const [feedback, setFeedback] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const busy = stage !== null;

  function buildRequest(): TailorRequest {
    return {
      situation: situation.trim(),
      timeCapMinutes: timeCap.trim() ? Math.max(1, Math.round(Number(timeCap))) : null,
      targetMovement: target.trim() || null,
      equipmentToday: overrideEquipment ? equipmentToday : null,
    };
  }

  /** Phase-1 call: JSON or a shown error code. */
  async function postJson<T>(url: string, body: unknown): Promise<T | null> {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) return (await res.json()) as T;
      const { error: code } = await res.json().catch(() => ({ error: "engine_failed" }));
      setError(ERROR_TEXT[code] ?? ERROR_TEXT.engine_failed);
    } catch {
      setError(ERROR_TEXT.engine_failed);
    }
    return null;
  }

  // The request is stored only with the result it produced, so Save always persists a matching pair.
  async function runEngine(url: string, body: unknown, req: TailorRequest) {
    setError(null);
    setSaved(false);
    setStage("tailoring");
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const { error: code } = await res.json().catch(() => ({ error: "engine_failed" }));
        setError(ERROR_TEXT[code] ?? ERROR_TEXT.engine_failed);
        return;
      }
      const outcome = await readEngineOutcome(res, setStage);
      if (outcome.kind === "result") {
        setResult(outcome.result);
        setRequest(req);
        setFeedback("");
      } else setError(ERROR_TEXT[outcome.error]);
    } catch {
      setError(ERROR_TEXT.engine_failed);
    } finally {
      setStage(null);
    }
  }

  /** Phase 2 with the conditions the athlete confirmed (none when nothing was suggested). */
  async function proceed(p: Pending, confirmed: ConfirmedCondition[]) {
    setPending(null);
    if (p.kind === "tailor") {
      const { original, unavailableEquipment } = p.analysis;
      await runEngine("/api/tailor", { analysis: { original, unavailableEquipment }, confirmed, request: p.request }, p.request);
    } else {
      await runEngine("/api/tailor/refine", {
        previous: p.previous, feedback: p.feedback, confirmed, unavailableEquipment: p.unavailableEquipment, request: p.request,
      }, p.request);
    }
  }

  /** Confirmation only when the analyzer suggested a condition; otherwise phase 2 starts at once. */
  async function confirmOrProceed(p: Pending) {
    if (p.suggested.length > 0) {
      setStage(null);
      setPending(p);
    } else await proceed(p, []);
  }

  async function submit() {
    const req = buildRequest();
    let input;
    if (mode === "paste") {
      if (!rawText.trim()) return setError("Paste a workout first.");
      input = { kind: "paste", rawText };
    } else {
      const parsed = ManualWorkoutSchema.safeParse(manual);
      if (!parsed.success) return setError("Give every movement a name.");
      input = { kind: "manual", workout: parsed.data };
    }
    // A new workout replaces the old result even if it fails: never leave a stale result to save.
    setResult(null);
    setRequest(null);
    setPending(null);
    setError(null);
    setStage("analyzing");
    const analysis = await postJson<WorkoutAnalysisResult>("/api/tailor/analyze", { input, request: req });
    if (!analysis) return setStage(null);
    await confirmOrProceed({ kind: "tailor", analysis, request: req, suggested: analysis.suggested });
  }

  async function refine() {
    if (!result || !feedback.trim()) return;
    // Refine with the form as it is now (a time cap or equipment set after the first run counts).
    const req = buildRequest();
    const text = feedback.trim();
    setError(null);
    setStage("analyzing");
    const a = await postJson<FeedbackAnalysis>("/api/tailor/refine/analyze", { feedback: text });
    if (!a) return setStage(null);
    await confirmOrProceed({
      kind: "refine", previous: result, feedback: text, unavailableEquipment: a.unavailableEquipment, request: req, suggested: a.suggested,
    });
  }

  async function save() {
    if (!result || !request) return;
    const res = await fetch("/api/tailor/save", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ result, request }),
    });
    if (res.ok) setSaved(true);
    else setError("Could not save the result.");
  }

  return (
    <div className="flex flex-col gap-6">
      <datalist id="movement-names">{movementNames.map((n) => <option key={n} value={n} />)}</datalist>

      <section className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button type="button" className={chip(mode === "paste")} aria-pressed={mode === "paste"} onClick={() => setMode("paste")}>Paste</button>
          <button type="button" className={chip(mode === "manual")} aria-pressed={mode === "manual"} onClick={() => setMode("manual")}>Enter manually</button>
        </div>
        {mode === "paste" ? (
          <textarea className={`${field} min-h-48`} value={rawText} onChange={(e) => setRawText(e.target.value)}
            placeholder={"Paste today's session exactly as programmed.\nMissed days? Paste all of them."} />
        ) : (
          <ManualEntryForm value={manual} onChange={setManual} movementNames={movementNames} />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Today</h2>
        <textarea className={`${field} min-h-20`} value={situation} onChange={(e) => setSituation(e.target.value)}
          placeholder="How are you? Pain, fatigue, missing equipment… in your own words (optional)" />
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">Time cap (min)
            <input className={`${field} w-20`} type="number" min={1} value={timeCap} onChange={(e) => setTimeCap(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">Work on
            <input className={field} list="movement-names" placeholder="movement (optional)" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={overrideEquipment} onChange={(e) => setOverrideEquipment(e.target.checked)} />
          Different equipment than usual today
        </label>
        {overrideEquipment && (
          <div className="flex flex-wrap gap-2">
            {equipmentOptions.map((e) => (
              <button key={e} type="button" className={chip(equipmentToday.includes(e))} aria-pressed={equipmentToday.includes(e)}
                onClick={() => setEquipmentToday(equipmentToday.includes(e) ? equipmentToday.filter((x) => x !== e) : [...equipmentToday, e])}>
                {e.replaceAll("_", " ")}
              </button>
            ))}
          </div>
        )}
      </section>

      <button type="button" className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => void submit()}>
        Tailor my workout
      </button>

      {busy && <p className="text-sm text-neutral-600" aria-live="polite">{STAGE_TEXT[stage!]}</p>}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {pending && (
        <ConfirmConditions key={pending.kind + pending.suggested.map((s) => s.key).join(",")}
          suggested={pending.suggested} catalog={catalog} busy={busy}
          onConfirm={(confirmed) => void proceed(pending, confirmed)} onCancel={() => setPending(null)} />
      )}

      {result && (
        <>
          <ResultView result={result} conditionLabels={conditionLabels} />
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Not quite right?</h2>
            <textarea className={`${field} min-h-16`} value={feedback} onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. still hurts, too easy, no rower" />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip(false)} disabled={busy || !feedback.trim()} onClick={() => void refine()}>Refine</button>
              <button type="button" className="rounded bg-black px-4 py-1 text-sm text-white disabled:opacity-50" disabled={busy || saved} onClick={save}>
                {saved ? "Saved" : "Save to history"}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
