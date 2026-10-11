"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Input, Textarea } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import type { ErrorCode } from "@/lib/training/errors";
import { buildScore, type LogDraft } from "@/lib/training/log-draft";
import type { ScoreTarget } from "@/lib/training/scoring";
import { addPrAction } from "../../../pr-actions";
import { deleteResultAction, saveResultAction } from "../../../result-actions";

type Props = {
  blockId: string;
  target: ScoreTarget;
  date: string;
  backHref: string;
  initial: LogDraft;
  initialDivision: "rx" | "scaled";
  initialNotes: string;
  hasResult: boolean;
};

type Prompt = { movement: string; from: number | null; to: number };

export function LogForm({ blockId, target, date, backHref, initial, initialDivision, initialNotes, hasResult }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [d, setD] = useState(initial);
  const [division, setDivision] = useState(initialDivision);
  const [notes, setNotes] = useState(initialNotes);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const set = (patch: Partial<LogDraft>) => setD((x) => ({ ...x, ...patch }));
  const done = () => { router.push(backHref); router.refresh(); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const r = await saveResultAction({ blockId, division, score: buildScore(target, d), notes });
    setPending(false);
    if (!r.ok) return setError(r.code);
    if (r.value.singlePrompt) setPrompt(r.value.singlePrompt);
    else done();
  }

  async function acceptPrompt() {
    if (!prompt) return;
    const r = await addPrAction({ movement: prompt.movement, kg: prompt.to, achievedOn: date });
    if (r.ok) done();
    else setError(r.code);
  }

  async function remove() {
    const yes = await confirm({ title: t("log.delete"), message: t("log.deleteConfirm"), confirmLabel: t("log.delete") });
    if (!yes) return;
    const r = await deleteResultAction(blockId);
    if (r.ok) done();
    else setError(r.code);
  }

  if (prompt) {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <p className="text-[15px]">{prompt.from === null
          ? t("log.singlePromptFirst", { movement: prompt.movement, to: prompt.to })
          : t("log.singlePrompt", { movement: prompt.movement, from: prompt.from, to: prompt.to })}</p>
        <div className="flex gap-3">
          <Button type="button" variant="primary" onClick={acceptPrompt}>{t("log.yes")}</Button>
          <Button type="button" variant="ghost" onClick={done}>{t("log.no")}</Button>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
      </Card>
    );
  }

  const time = (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t("log.minutes")}>
        <Input inputMode="numeric" value={d.minutes} onChange={(e) => set({ minutes: e.target.value })} />
      </Field>
      <Field label={t("log.seconds")}>
        <Input inputMode="numeric" value={d.seconds} onChange={(e) => set({ seconds: e.target.value })} />
      </Field>
    </div>
  );
  const single = (label: string, decimal = false) => (
    <Field label={label}>
      <Input inputMode={decimal ? "decimal" : "numeric"} value={d.value} onChange={(e) => set({ value: e.target.value })} />
    </Field>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      {target.kind === "barbell" ? (
        d.sets.map((s, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("log.set", { n: i + 1 })}</span>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("log.kg")}>
                <Input inputMode="decimal" value={s.kg}
                  onChange={(e) => set({ sets: d.sets.map((x, j) => (j === i ? { ...x, kg: e.target.value } : x)) })} />
              </Field>
              <Field label={t("log.reps")}>
                <Input inputMode="numeric" value={s.reps}
                  onChange={(e) => set({ sets: d.sets.map((x, j) => (j === i ? { ...x, reps: e.target.value } : x)) })} />
              </Field>
            </div>
          </div>
        ))
      ) : (
        <>
          {target.scoring === "for_time" && (
            <>
              {d.capped
                ? <Field label={t("log.repsDone")}><Input inputMode="numeric" value={d.reps} onChange={(e) => set({ reps: e.target.value })} /></Field>
                : time}
              {target.timeCapSeconds !== null && (
                <label className="flex items-center gap-3 text-sm">
                  <input type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={d.capped} onChange={(e) => set({ capped: e.target.checked })} />
                  {t("log.capped")}
                </label>
              )}
            </>
          )}
          {target.scoring === "max_time" && time}
          {target.scoring === "amrap" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("log.rounds")}><Input inputMode="numeric" value={d.rounds} onChange={(e) => set({ rounds: e.target.value })} /></Field>
              <Field label={t("log.reps")}><Input inputMode="numeric" value={d.reps} onChange={(e) => set({ reps: e.target.value })} /></Field>
            </div>
          )}
          {target.scoring === "reps" && single(t("log.reps"))}
          {target.scoring === "load" && single(t("log.kg"), true)}
          {target.scoring === "calories" && single(t("log.calories"))}
          {target.scoring === "distance" && single(t("log.meters"), true)}
          <Segmented label={t("log.rx")} value={division} onChange={setDivision}
            options={[{ value: "rx", label: t("log.rx") }, { value: "scaled", label: t("log.scaled") }]} />
        </>
      )}
      <Field label={t("log.notes")}>
        <Textarea rows={4} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
      <Button type="submit" variant="primary" block disabled={pending}>{t("log.save")}</Button>
      {hasResult && <Button type="button" variant="danger" block onClick={remove}>{t("log.delete")}</Button>}
      {dialog}
    </form>
  );
}
