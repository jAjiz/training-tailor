"use client";

import { useState } from "react";
import type { Equipment } from "@/lib/domain/types";
import type { ProgressStage } from "@/lib/engine/pipeline";
import { ManualWorkoutSchema, type ManualWorkout, type PipelineResult, type TailorRequest } from "@/lib/engine/types";
import { readEngineStream } from "@/lib/engine-events";
import { ManualEntryForm, emptyManualWorkout } from "./ManualEntryForm";
import { ResultView } from "./ResultView";

interface Props {
  movementNames: string[];
  equipmentOptions: Equipment[];
  conditionLabels: Record<string, string>;
}

const STAGE_TEXT: Record<ProgressStage, string> = {
  analyzing: "Reading the workout and your situation…",
  tailoring: "Tailoring the session…",
  validating: "Checking it against your conditions and equipment…",
  retrying: "Fixing what the check found…",
};

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "Your session expired. Sign in again.",
  invalid_request: "Something in the form is not valid.",
  quota_exceeded: "You reached today's limit. Try again tomorrow.",
  engine_unavailable: "The engine is not configured.",
  engine_failed: "The engine failed. Try again.",
  engine_unsafe: "We could not produce a modification that is safe for your conditions. Rephrase your situation, or check with a professional.",
};

const field = "rounded border px-2 py-1 text-sm";
const chip = (on: boolean) => `rounded border px-3 py-1 text-sm ${on ? "bg-black text-white" : ""}`;

export function TailorClient({ movementNames, equipmentOptions, conditionLabels }: Props) {
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
  const busy = stage !== null;

  function buildRequest(): TailorRequest {
    return {
      situation: situation.trim(),
      timeCapMinutes: timeCap.trim() ? Math.max(1, Math.round(Number(timeCap))) : null,
      targetMovement: target.trim() || null,
      equipmentToday: overrideEquipment ? equipmentToday : null,
    };
  }

  async function runEngine(url: string, body: unknown) {
    setError(null);
    setSaved(false);
    setStage("analyzing");
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const { error: code } = await res.json().catch(() => ({ error: "engine_failed" }));
        setError(ERROR_TEXT[code] ?? ERROR_TEXT.engine_failed);
        return;
      }
      await readEngineStream(res, (e) => {
        if (e.type === "progress") setStage(e.stage);
        else if (e.type === "result") {
          setResult(e.result);
          setFeedback("");
        } else setError(ERROR_TEXT[e.error]);
      });
    } catch {
      setError(ERROR_TEXT.engine_failed);
    } finally {
      setStage(null);
    }
  }

  function submit() {
    const req = buildRequest();
    if (mode === "paste") {
      if (!rawText.trim()) return setError("Paste a workout first.");
      setRequest(req);
      void runEngine("/api/tailor", { input: { kind: "paste", rawText }, request: req });
      return;
    }
    const parsed = ManualWorkoutSchema.safeParse(manual);
    if (!parsed.success) return setError("Give every movement a name.");
    setRequest(req);
    void runEngine("/api/tailor", { input: { kind: "manual", workout: parsed.data }, request: req });
  }

  function refine() {
    if (!result || !request || !feedback.trim()) return;
    void runEngine("/api/tailor/refine", { previous: result, feedback: feedback.trim(), request });
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

      <button type="button" className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={submit}>
        Tailor my workout
      </button>

      {busy && <p className="text-sm text-neutral-600" aria-live="polite">{STAGE_TEXT[stage!]}</p>}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}

      {result && (
        <>
          <ResultView result={result} conditionLabels={conditionLabels} />
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Not quite right?</h2>
            <textarea className={`${field} min-h-16`} value={feedback} onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. still hurts, too easy, no rower" />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip(false)} disabled={busy || !feedback.trim()} onClick={refine}>Refine</button>
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
