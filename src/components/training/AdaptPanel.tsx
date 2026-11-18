"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { acceptAdaptationAction } from "@/app/(athlete)/adapt-actions";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/controls";
import { Modal } from "@/components/ui/Modal";
import type { ClarifyAnswer } from "@/lib/engine/clarify";
import type { ProgressStage } from "@/lib/engine/pipeline";
import type { ClarifyQuestion, Finding } from "@/lib/engine/types";
import { readEngineOutcome } from "@/lib/engine-events";
import type { AdaptationMessage } from "@/lib/training/adaptation-types";
import { AdaptedBlock } from "./AdaptedBlock";

type Props = {
  blockId: string;
  blockTitle: string;
  initialMessages: AdaptationMessage[];
  hasAccepted: boolean;
  open: boolean;
  onClose(): void;
};

const ERRORS = [
  "unauthorized", "forbidden", "account_disabled", "tailoring_off", "day_passed", "not_found", "invalid_request",
  "payload_too_large", "block_changed", "invalid_state", "quota_exceeded", "engine_unsafe", "engine_empty", "engine_failed",
  "engine_unavailable", "internal",
] as const;
type AdaptError = (typeof ERRORS)[number];
const asError = (code: unknown): AdaptError => (ERRORS as readonly unknown[]).includes(code) ? code as AdaptError : "internal";
// Failures a second tailoring run may get past; a refusal (unsafe, empty) needs the athlete to say more.
const RETRYABLE: AdaptError[] = ["engine_failed", "engine_unavailable", "internal"];

type SiteQuestion = Extract<ClarifyQuestion, { kind: "site" }>;
type ReplacementQuestion = Extract<ClarifyQuestion, { kind: "replacement" }>;

const answers = (q: ClarifyQuestion, a: ClarifyAnswer) =>
  q.restriction === a.restriction && (q.kind === "site"
    ? a.kind === "site"
    : a.kind === "replacement" && q.blockIndex === a.blockIndex && q.componentIndex === a.componentIndex);

/**
 * The questions the stored conversation leaves open, replayed as the server keeps them: a button answer closes its
 * question; a typed answer closes the first site question and renumbers the later restrictions; a new message or a
 * proposal starts from none.
 */
export function openQuestionsOf(messages: AdaptationMessage[]): ClarifyQuestion[] {
  let open: ClarifyQuestion[] = [];
  for (const m of messages) {
    if (m.role === "question") open.push(m.question);
    else if (m.role === "athlete" || m.role === "proposal") open = [];
    else if (m.role === "answer" && "text" in m.answer) {
      const site = open.find((q) => q.kind === "site");
      if (!site) continue;
      open = open.filter((q) => q !== site).map((q) => (q.restriction > site.restriction ? { ...q, restriction: q.restriction - 1 } : q));
    } else if (m.role === "answer") {
      const answer = m.answer as ClarifyAnswer;
      const i = open.findIndex((q) => answers(q, answer));
      if (i >= 0) open = open.filter((_, j) => j !== i);
    }
  }
  return open;
}

/** True when the last turn was read but never tailored (a failed or interrupted run): it can be run again. */
function untailored(messages: AdaptationMessage[]): boolean {
  const last = messages.at(-1);
  if (!last || openQuestionsOf(messages).length > 0) return false;
  return last.role === "athlete" || last.role === "answer" || (last.role === "error" && last.code === "engine_failed");
}

const now = () => new Date().toISOString();

/** The athlete's conversation about one block: messages, the engine's questions, proposals and Accept. */
export function AdaptPanel({ blockId, blockTitle, initialMessages, hasAccepted, open, onClose }: Props) {
  const t = useTranslations("adapt");
  const tc = useTranslations("common");
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [questions, setQuestions] = useState(() => openQuestionsOf(initialMessages));
  const [canRetry, setCanRetry] = useState(() => untailored(initialMessages));
  const [stage, setStage] = useState<ProgressStage | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<AdaptError | null>(null);
  // A proposal for a block the coach changed can no longer be accepted.
  const [cleared, setCleared] = useState(false);
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const busy = stage !== null || accepting;

  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [messages, questions, stage, error]);

  const latest = cleared ? -1 : messages.findLastIndex((m) => m.role === "proposal");
  const siteOpen = questions.some((q) => q.kind === "site");
  // A typed message answers an open site question; replacement questions take the buttons only.
  const typing = questions.length === 0 || siteOpen;

  function fail(code: AdaptError) {
    setError(code);
    if (code === "block_changed") {
      setQuestions([]);
      setCleared(true);
    }
  }

  /** The route's response, or the error code it refused with (a network failure counts as engine_failed). */
  async function post(step: "analyze" | "tailor", body: unknown): Promise<Response | AdaptError> {
    try {
      const res = await fetch(`/api/blocks/${blockId}/adapt/${step}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      if (res.ok) return res;
      const payload = await res.json().catch(() => null) as { error?: unknown } | null;
      return asError(payload?.error ?? "engine_failed");
    } catch {
      return "engine_failed";
    }
  }

  async function tailor() {
    setStage("tailoring");
    setCanRetry(false);
    let failed: AdaptError | null = null;
    try {
      const res = await post("tailor", {});
      if (typeof res === "string") failed = res;
      else {
        const outcome = await readEngineOutcome(res, setStage);
        if (outcome.kind === "error") failed = outcome.error;
        else {
          const { tailored, findings } = outcome.result;
          setMessages((ms) => [...ms, { role: "proposal", at: now(), tailored, findings }]);
          setCleared(false);
        }
      }
    } catch {
      failed = "engine_failed"; // the stream broke off
    } finally {
      setStage(null);
    }
    if (failed) {
      fail(failed);
      setCanRetry(RETRYABLE.includes(failed));
    }
  }

  /** One message to the analyze route; tailors at once when no question is left. */
  async function analyze(body: { text: string } | { answers: ClarifyAnswer[] }, sent: AdaptationMessage[]) {
    setError(null);
    setStage("analyzing");
    setCanRetry(false);
    const res = await post("analyze", body);
    const read = typeof res === "string" ? null : await res.json().catch(() => null) as { questions?: ClarifyQuestion[] } | null;
    if (!read?.questions) {
      fail(typeof res === "string" ? res : "engine_failed");
      setStage(null);
      return;
    }
    setMessages((ms) => [...ms, ...sent, ...read.questions!.map((question): AdaptationMessage => ({ role: "question", at: now(), question }))]);
    setQuestions(read.questions);
    if ("text" in body) setDraft("");
    if (read.questions.length === 0) await tailor();
    else setStage(null);
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy || !typing) return;
    const sent: AdaptationMessage = siteOpen ? { role: "answer", at: now(), answer: { text } } : { role: "athlete", at: now(), text };
    void analyze({ text }, [sent]);
  }

  function answer(given: ClarifyAnswer[]) {
    void analyze({ answers: given }, given.map((a): AdaptationMessage => ({ role: "answer", at: now(), answer: a })));
  }

  function retry() {
    setError(null);
    void tailor();
  }

  async function accept() {
    setError(null);
    setAccepting(true);
    try {
      const r = await acceptAdaptationAction(blockId);
      if (r.ok) {
        onClose();
        router.refresh();
      } else if (r.code === "invalid_state") {
        fail("block_changed"); // the server restarted the session (a coach edit or a library update): no proposal is left
      } else fail(asError(r.code));
    } catch {
      fail("internal");
    } finally {
      setAccepting(false);
    }
  }

  if (!open) return null;

  return (
    <Modal title={t("panelTitle", { action: t(hasAccepted ? "adjust" : "open"), block: blockTitle })} closeLabel={tc("close")} onClose={onClose} busy={accepting} placement="bottom"
      footer={typing ? (
        <form onSubmit={send} className="flex w-full flex-col gap-2">
          <label htmlFor={`adapt-${blockId}`} className="sr-only">{t("inputLabel")}</label>
          <Textarea id={`adapt-${blockId}`} compact rows={2} maxLength={2000} value={draft} disabled={busy}
            placeholder={siteOpen ? t("answerPlaceholder") : t("placeholder")} onChange={(e) => setDraft(e.target.value)} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">{t("privacy")}</p>
            <Button type="submit" variant="primary" size="sm" slanted disabled={busy || draft.trim() === ""}>{t("send")}</Button>
          </div>
        </form>
      ) : (
        <div className="flex w-full flex-col gap-1">
          <p className="text-sm text-muted">{t("pickAbove")}</p>
          <p className="text-xs text-muted">{t("privacy")}</p>
        </div>
      )}>
      <div className="flex flex-col gap-4">
        {messages.length === 0 && <p className="text-[15px] leading-relaxed text-muted">{t("intro")}</p>}
        {messages.map((m, i) => (
          <Entry key={i} message={m} latest={i === latest} busy={busy} accepting={accepting} onAccept={() => void accept()} />
        ))}
        {questions.length > 0 && (
          <Questions key={JSON.stringify(questions)} questions={questions} busy={busy} onSubmit={answer} />
        )}
        {stage && <p className="text-sm text-muted" aria-live="polite">{t(`stage.${stage}`)}</p>}
        {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
        {canRetry && !busy && (
          <Button type="button" size="sm" className="self-start" onClick={retry}>{t("retry")}</Button>
        )}
        <p className="text-xs text-muted">{t("notMedical")}</p>
        <div ref={end} />
      </div>
    </Modal>
  );
}

function Entry({ message: m, latest, busy, accepting, onAccept }: {
  message: AdaptationMessage; latest: boolean; busy: boolean; accepting: boolean; onAccept: () => void;
}) {
  const t = useTranslations("adapt");
  const describe = useAnswerText();
  const findingText = useFindingText();
  if (m.role === "question") return null; // open ones are asked below; answered ones show through their answer
  if (m.role === "athlete" || m.role === "answer") {
    const text = m.role === "athlete" ? m.text : "text" in m.answer ? m.answer.text : describe(m.answer as ClarifyAnswer);
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="sr-only">{t("you")}</span>
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-tint px-3 py-2 text-[15px] text-accent-ink">{text}</p>
      </div>
    );
  }
  if (m.role === "error") return <p className="text-sm text-muted">{t(`errors.${m.code}`)}</p>;
  if (!latest) {
    return (
      <details className="rounded-xl border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-muted">{t("earlierProposal")}</summary>
        <div className="pt-2"><AdaptedBlock tailored={m.tailored} /></div>
      </details>
    );
  }
  return (
    <section aria-label={t("proposal")} className="flex flex-col gap-3 rounded-xl border bg-surface p-3">
      <p className="type-label text-accent-ink">{t("proposal")}</p>
      <AdaptedBlock tailored={m.tailored} />
      <p className="text-sm leading-relaxed text-muted">{m.tailored.rationale}</p>
      {m.findings.length > 0 && (
        <div data-color="yellow" className="flex flex-col gap-1 rounded-xl bg-(--block-fill) px-3 py-2 text-sm text-(--block-ink)">
          <p className="font-semibold">{t("warning")}</p>
          <ul className="list-disc pl-5">{m.findings.map((f, i) => <li key={i}>{findingText(f)}</li>)}</ul>
        </div>
      )}
      <Button type="button" variant="primary" size="sm" slanted className="self-start" disabled={busy} onClick={onAccept}>
        {accepting ? t("accepting") : t("accept")}
      </Button>
    </section>
  );
}

const MOVEMENT_FINDINGS: Finding["kind"][] = [
  "unrecognized_movement", "caution_movement", "contraindicated_movement", "equipment_unavailable", "percent_load_dropped",
];
const BLOCK_FINDINGS: Finding["kind"][] = ["time_cap_exceeded", "stimulus_drift", "scoring_changed", "change_mismatch", "unaccounted_block"];

/**
 * A finding in the athlete's language, from its kind, movement and block. The validator's own message is internal
 * English (kept for logs and the coach) and never shown here; a kind without copy gets a generic line.
 */
function useFindingText() {
  const t = useTranslations("adapt.findings");
  return (f: Finding): string => {
    if (MOVEMENT_FINDINGS.includes(f.kind) && f.movement) return t(f.kind, { movement: f.movement });
    if (BLOCK_FINDINGS.includes(f.kind)) return t(f.kind, { block: f.blockIndex === null ? "none" : String(f.blockIndex + 1) });
    return t("other");
  };
}

/** A button answer in the athlete's words, for the conversation. */
function useAnswerText() {
  const t = useTranslations("adapt");
  return (a: ClarifyAnswer): string => {
    if (a.kind === "replacement") return t("answer.replacement", { name: a.replacement });
    if (a.mechanisms === "all" || a.mechanisms === "none") return t(`answer.${a.mechanisms}`);
    return a.mechanisms.map((m) => t(`mechanisms.${m}`)).join(", ");
  };
}

function useWhere() {
  const t = useTranslations("adapt");
  return (site: string, side: string | null) => side && side !== "both"
    ? t("where", { site: t(`sites.${site}`), side: t(`sides.${side}`) })
    : t(`sites.${site}`);
}

// A site question: tick the kinds of load that bother it, or one of the whole-site answers.
type SiteState = { mode: "pick" | "all" | "none"; picked: number[] };

/** Asked only when the athlete's words leave the scope open; every answer bans exactly what was chosen. */
function Questions({ questions, busy, onSubmit }: { questions: ClarifyQuestion[]; busy: boolean; onSubmit: (answers: ClarifyAnswer[]) => void }) {
  const t = useTranslations("adapt");
  const [sites, setSites] = useState<Record<number, SiteState>>({});
  const [picks, setPicks] = useState<Record<number, string>>(() =>
    Object.fromEntries(questions.flatMap((q, i) => (q.kind === "replacement" ? [[i, q.preselected]] : []))));
  const site = (i: number): SiteState => sites[i] ?? { mode: "pick", picked: [] };
  const setSite = (i: number, next: SiteState) => setSites({ ...sites, [i]: next });

  const answered = questions.every((q, i) => q.kind === "replacement" ? Boolean(picks[i]) : site(i).mode !== "pick" || site(i).picked.length > 0);

  function submit() {
    onSubmit(questions.map((q, i): ClarifyAnswer => {
      if (q.kind === "replacement") {
        return { kind: "replacement", restriction: q.restriction, blockIndex: q.blockIndex, componentIndex: q.componentIndex, replacement: picks[i] };
      }
      const s = site(i);
      return {
        kind: "site", restriction: q.restriction,
        mechanisms: s.mode === "pick" ? [...new Set(s.picked.flatMap((o) => q.options[o].mechanisms))] : s.mode,
      };
    }));
  }

  return (
    <section data-color="yellow" className="flex flex-col gap-3 rounded-xl bg-(--block-fill) p-3" aria-label={t("questionsTitle")}>
      <p className="font-semibold text-(--block-ink)">{t("questionsTitle")}</p>
      {questions.map((q, i) => q.kind === "site"
        ? <SiteFieldset key={i} index={i} question={q} state={site(i)} onChange={(s) => setSite(i, s)} />
        : <ReplacementFieldset key={i} index={i} question={q} pick={picks[i]} onPick={(name) => setPicks({ ...picks, [i]: name })} />)}
      <Button type="button" variant="primary" size="sm" slanted className="self-start" disabled={busy || !answered} onClick={submit}>
        {t("continue")}
      </Button>
    </section>
  );
}

const fieldset = "flex flex-col gap-2 rounded-xl border bg-surface p-3 text-sm";
const option = "flex items-start gap-2 py-1";

function SiteFieldset({ index, question: q, state, onChange }: {
  index: number; question: SiteQuestion; state: SiteState; onChange: (s: SiteState) => void;
}) {
  const t = useTranslations("adapt");
  const where = useWhere();
  return (
    <fieldset className={fieldset}>
      <legend className="float-left mb-1 font-semibold">{t("site.question", { where: where(q.site, q.side) })}</legend>
      <p className="clear-left text-xs text-muted">&ldquo;{q.evidence}&rdquo;</p>
      {q.options.map((o, j) => (
        <label key={j} className={option}>
          <input type="checkbox" className="mt-0.5 accent-primary" checked={state.mode === "pick" && state.picked.includes(j)}
            onChange={(e) => onChange({ mode: "pick", picked: e.target.checked ? [...state.picked, j] : state.picked.filter((x) => x !== j) })} />
          <span>{o.mechanisms.map((m) => t(`mechanisms.${m}`)).join(", ")}: <span className="text-muted">{o.movements.join(", ")}</span></span>
        </label>
      ))}
      <label className={option}>
        <input type="radio" name={`site-${index}`} className="mt-0.5 accent-primary" checked={state.mode === "all"} onChange={() => onChange({ mode: "all", picked: [] })} />
        {t("site.all", { where: where(q.site, null) })}
      </label>
      <label className={option}>
        <input type="radio" name={`site-${index}`} className="mt-0.5 accent-primary" checked={state.mode === "none"} onChange={() => onChange({ mode: "none", picked: [] })} />
        {t("site.none")}
      </label>
    </fieldset>
  );
}

function ReplacementFieldset({ index, question: q, pick, onPick }: {
  index: number; question: ReplacementQuestion; pick: string | undefined; onPick: (name: string) => void;
}) {
  const t = useTranslations("adapt");
  const where = useWhere();
  return (
    <fieldset className={fieldset}>
      <legend className="float-left mb-1 font-semibold">{t("replacement.question", { movement: q.movement })}</legend>
      <p className="clear-left text-xs text-muted">{t("replacement.hint", { where: where(q.site, null) })}</p>
      {q.options.map((o) => (
        <label key={o.name} className={option}>
          <input type="radio" name={`replacement-${index}`} className="mt-0.5 accent-primary" checked={pick === o.name} onChange={() => onPick(o.name)} />
          <span>
            {o.name}
            {o.shared.length > 0 && (
              <span className="text-muted"> · {t("replacement.alsoLoads", { where: where(q.site, null), loads: o.shared.map((m) => t(`mechanisms.${m}`)).join(", ") })}</span>
            )}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
