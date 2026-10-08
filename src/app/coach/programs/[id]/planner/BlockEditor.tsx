"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { draftFromBlock, draftToInput, emptyDraft, type BlockDraft, type DraftSet } from "@/lib/training/block-draft";
import type { ErrorCode } from "@/lib/training/errors";
import { BLOCK_COLORS, Scoring } from "@/lib/training/schemas";
import type { LiftGroup } from "@/lib/training/barbell";
import { createBlockAction, updateBlockAction } from "../../../block-actions";
import type { PlannerBlockData } from "./types";

type Props =
  | { mode: "create"; programId: string; dayIndex: number; lifts: LiftGroup[]; onClose: () => void }
  | { mode: "edit"; block: PlannerBlockData; lifts: LiftGroup[]; onClose: () => void };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-sm">{label}{children}</label>;
}

const input = "rounded border px-3 py-2";

export function BlockEditor(props: Props) {
  const t = useTranslations();
  const router = useRouter();
  const locked = props.mode === "edit" && props.block.resultCount > 0;
  const [draft, setDraft] = useState<BlockDraft>(props.mode === "edit" ? draftFromBlock(props.block) : emptyDraft("custom"));
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<BlockDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setRow = (i: number, patch: Partial<DraftSet>) =>
    set({ sets: draft.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  function switchKind(kind: BlockDraft["kind"]) {
    if (kind === draft.kind) return;
    setDraft({ ...emptyDraft(kind), title: draft.title, color: draft.color, coachingTips: draft.coachingTips, videoUrl: draft.videoUrl });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const block = draftToInput(draft);
    const r = props.mode === "edit"
      ? await updateBlockAction({ blockId: props.block.id, block })
      : await createBlockAction({ programId: props.programId, dayIndex: props.dayIndex, block });
    setPending(false);
    if (r.ok) {
      props.onClose();
      router.refresh();
    } else {
      setError(r.code);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <form onSubmit={save} className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded bg-white p-6">
        <h2 className="text-lg font-semibold">{props.mode === "edit" ? t("editor.editBlock") : t("editor.newBlock")}</h2>
        <div className="flex gap-2">
          {(["custom", "barbell"] as const).map((k) => (
            <button key={k} type="button" disabled={locked && draft.kind !== k} onClick={() => switchKind(k)}
              className={draft.kind === k ? "rounded bg-black px-3 py-1 text-white" : "rounded border px-3 py-1 disabled:opacity-40"}>
              {t(`editor.kinds.${k}`)}
            </button>
          ))}
        </div>
        <Field label={t("editor.title")}>
          <input className={input} maxLength={120} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>

        {draft.kind === "custom" ? (
          <>
            <Field label={t("editor.description")}>
              <textarea required rows={8} maxLength={5000} className={`${input} font-mono text-sm`} value={draft.description}
                onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-4">
              <Field label={t("editor.scoring")}>
                <select disabled={locked} className={input} value={draft.scoring}
                  onChange={(e) => set({ scoring: e.target.value as BlockDraft["scoring"] })}>
                  {Scoring.options.map((s) => <option key={s} value={s}>{t(`block.scoring.${s}`)}</option>)}
                </select>
              </Field>
              {draft.scoring === "for_time" && (
                <Field label={t("editor.timeCap")}>
                  <input type="number" min={1} max={120} step="0.5" className={input} value={draft.timeCapMinutes}
                    onChange={(e) => set({ timeCapMinutes: e.target.value })} />
                </Field>
              )}
            </div>
            {locked && <p className="text-xs text-neutral-500">{t("editor.scoringLockedHint")}</p>}
          </>
        ) : (
          <>
            <Field label={t("editor.movement")}>
              <select required className={input} value={draft.movement} onChange={(e) => set({ movement: e.target.value })}>
                <option value="" disabled>—</option>
                {props.lifts.map((g) => (
                  <optgroup key={g.pattern} label={t(`patterns.${g.pattern}`)}>
                    {g.movements.map((m) => <option key={m} value={m}>{m}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm">{t("editor.sets")}</legend>
              {draft.sets.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-6 text-neutral-500">#{i + 1}</span>
                  <input type="number" min={1} max={100} aria-label={t("editor.reps")} className="w-16 rounded border px-2 py-1"
                    value={s.reps} onChange={(e) => setRow(i, { reps: e.target.value })} />
                  <span>{t("editor.reps")} @</span>
                  <input type="number" min={0} step="0.5" className="w-20 rounded border px-2 py-1" value={s.value}
                    onChange={(e) => setRow(i, { value: e.target.value })} />
                  <select className="rounded border px-2 py-1" value={s.mode} onChange={(e) => setRow(i, { mode: e.target.value as DraftSet["mode"] })}>
                    <option value="percent">{t("editor.percent")}</option>
                    <option value="kg">{t("editor.kg")}</option>
                  </select>
                  {draft.sets.length > 1 && (
                    <button type="button" className="text-red-700" onClick={() => set({ sets: draft.sets.filter((_, j) => j !== i) })}>
                      {t("editor.removeSet")}
                    </button>
                  )}
                </div>
              ))}
              {draft.sets.length < 20 && (
                <button type="button" className="w-fit underline text-sm" onClick={() => set({ sets: [...draft.sets, { ...draft.sets[draft.sets.length - 1] }] })}>
                  {t("editor.addSet")}
                </button>
              )}
            </fieldset>
            <Field label={t("editor.instructions")}>
              <textarea rows={3} maxLength={2000} className={input} value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} />
            </Field>
          </>
        )}

        <Field label={t("editor.coachingTips")}>
          <textarea rows={3} maxLength={2000} className={input} value={draft.coachingTips} onChange={(e) => set({ coachingTips: e.target.value })} />
        </Field>
        <Field label={t("editor.videoUrl")}>
          <input type="url" placeholder="https://" className={input} value={draft.videoUrl} onChange={(e) => set({ videoUrl: e.target.value })} />
        </Field>
        <fieldset className="flex items-center gap-2">
          <legend className="mb-1 text-sm">{t("editor.color")}</legend>
          {BLOCK_COLORS.map((c) => (
            <button key={c} type="button" aria-label={c} aria-pressed={draft.color === c} onClick={() => set({ color: c })}
              data-color={c} className={`h-7 w-7 rounded-full bg-(--block-stripe) ${draft.color === c ? "ring-2 ring-foreground ring-offset-2" : ""}`} />
          ))}
        </fieldset>
        {error && <p className="text-sm text-red-700">{t(`errors.${error}`)}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={props.onClose}>{t("common.cancel")}</button>
          <button disabled={pending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">{t("common.save")}</button>
        </div>
      </form>
    </div>
  );
}
