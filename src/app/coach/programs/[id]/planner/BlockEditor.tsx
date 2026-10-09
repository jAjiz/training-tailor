"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ColorSwatches } from "@/components/ui/ColorSwatches";
import { Input, Select, Textarea } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/Segmented";
import { draftFromBlock, draftToInput, emptyDraft, type BlockDraft, type DraftSet } from "@/lib/training/block-draft";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";
import { BLOCK_COLORS, Scoring, type BlockColor } from "@/lib/training/schemas";
import type { LiftGroup } from "@/lib/training/barbell";
import { createBlockAction, updateBlockAction } from "../../../block-actions";
import type { PlannerBlockData } from "./types";

type Props =
  | { mode: "create"; programId: string; dayIndex: number; lifts: LiftGroup[]; onClose: () => void }
  | { mode: "edit"; block: PlannerBlockData; lifts: LiftGroup[]; onClose: () => void };

const th = "px-3 py-2 font-semibold";

export function BlockEditor(props: Props) {
  const t = useTranslations();
  const router = useRouter();
  const formId = useId();
  const locked = props.mode === "edit" && props.block.resultCount > 0;
  const [initial] = useState<BlockDraft>(() => (props.mode === "edit" ? draftFromBlock(props.block) : emptyDraft("custom")));
  const [draft, setDraft] = useState<BlockDraft>(initial);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<BlockDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setRow = (i: number, patch: Partial<DraftSet>) =>
    set({ sets: draft.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  // The draft keeps both kinds' fields and draftToInput sends only the chosen kind's, so switching back and
  // forth (arrow keys select at once) loses nothing.
  const switchKind = (kind: BlockDraft["kind"]) => set({ kind });

  // Esc, the backdrop, the close button and Cancel all come here: unsaved changes need a confirmation.
  function requestClose() {
    if (pending) return;
    if (JSON.stringify(draft) === JSON.stringify(initial) || window.confirm(t("editor.discardConfirm"))) props.onClose();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const block = draftToInput(draft);
    let r: ActionResult;
    try {
      r = props.mode === "edit"
        ? await updateBlockAction({ blockId: props.block.id, block })
        : await createBlockAction({ programId: props.programId, dayIndex: props.dayIndex, block });
    } catch {
      r = { ok: false, code: "internal" };
    } finally {
      setPending(false);
    }
    if (r.ok) {
      props.onClose();
      router.refresh();
    } else {
      setError(r.code);
    }
  }

  return (
    <Modal title={props.mode === "edit" ? t("editor.editBlock") : t("editor.newBlock")} closeLabel={t("common.close")} onClose={requestClose}
      footer={<>
        {error && <p role="alert" className="mr-auto text-sm text-danger">{t(`errors.${error}`)}</p>}
        <Button type="button" onClick={requestClose}>{t("common.cancel")}</Button>
        <Button type="submit" form={formId} variant="primary" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</Button>
      </>}>
      <form id={formId} onSubmit={save} className="flex flex-col gap-5">
        <Segmented label={t("editor.kind")} value={draft.kind} onChange={switchKind}
          options={(["custom", "barbell"] as const).map((k) => ({ value: k, label: t(`editor.kinds.${k}`), disabled: locked && draft.kind !== k }))} />
        <Field label={t("editor.title")}>
          <Input maxLength={120} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>

        {draft.kind === "custom" ? (
          <>
            <Field label={t("editor.description")}>
              <Textarea required rows={8} maxLength={5000} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("editor.scoring")} hint={locked ? t("editor.scoringLockedHint") : null}>
                <Select disabled={locked} value={draft.scoring} onChange={(e) => set({ scoring: e.target.value as BlockDraft["scoring"] })}>
                  {Scoring.options.map((s) => <option key={s} value={s}>{t(`block.scoring.${s}`)}</option>)}
                </Select>
              </Field>
              {draft.scoring === "for_time" && (
                <Field label={t("editor.timeCap")}>
                  <Input type="number" min={1} max={120} step="0.5" value={draft.timeCapMinutes} onChange={(e) => set({ timeCapMinutes: e.target.value })} />
                </Field>
              )}
            </div>
          </>
        ) : (
          <>
            <Field label={t("editor.movement")}>
              <Select required value={draft.movement} onChange={(e) => set({ movement: e.target.value })}>
                <option value="" disabled>—</option>
                {props.lifts.map((g) => (
                  <optgroup key={g.pattern} label={t(`patterns.${g.pattern}`)}>
                    {g.movements.map((m) => <option key={m} value={m}>{m}</option>)}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium">{t("editor.sets")}</legend>
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-left text-xs text-muted">
                    <tr>
                      <th scope="col" className={th}>{t("editor.setNumber")}</th>
                      <th scope="col" className={th}>{t("editor.reps")}</th>
                      <th scope="col" className={th}>{t("editor.value")}</th>
                      <th scope="col" className={th}>{t("editor.unit")}</th>
                      <th scope="col" className="w-11"><span className="sr-only">{t("editor.actions")}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.sets.map((s, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-1.5 font-semibold text-muted">#{i + 1}</td>
                        <td className="py-1.5 pr-2">
                          <Input compact className="w-full" type="number" min={1} max={100} aria-label={`${t("editor.reps")} #${i + 1}`}
                            value={s.reps} onChange={(e) => setRow(i, { reps: e.target.value })} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input compact className="w-full" type="number" min={0} step="0.5" aria-label={`${t("editor.value")} #${i + 1}`}
                            value={s.value} onChange={(e) => setRow(i, { value: e.target.value })} />
                        </td>
                        <td className="py-1.5 pr-1">
                          <Select compact className="w-full" aria-label={`${t("editor.unit")} #${i + 1}`} value={s.mode}
                            onChange={(e) => setRow(i, { mode: e.target.value as DraftSet["mode"] })}>
                            <option value="percent">{t("editor.percent")}</option>
                            <option value="kg">{t("editor.kg")}</option>
                          </Select>
                        </td>
                        <td className="py-1.5 pr-1">
                          <IconButton label={t("editor.removeSet", { number: i + 1 })} disabled={draft.sets.length <= 1}
                            onClick={() => set({ sets: draft.sets.filter((_, j) => j !== i) })}>
                            <X size={16} aria-hidden />
                          </IconButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {draft.sets.length < 20 && (
                <Button type="button" size="sm" variant="ghost" className="self-start"
                  onClick={() => set({ sets: [...draft.sets, { ...draft.sets[draft.sets.length - 1] }] })}>
                  <Plus size={16} aria-hidden />
                  {t("editor.addSet")}
                </Button>
              )}
            </fieldset>
            <Field label={t("editor.instructions")}>
              <Textarea rows={3} maxLength={2000} value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} />
            </Field>
          </>
        )}

        <Field label={t("editor.coachingTips")}>
          <Textarea rows={3} maxLength={2000} value={draft.coachingTips} onChange={(e) => set({ coachingTips: e.target.value })} />
        </Field>
        <Field label={t("editor.videoUrl")}>
          <Input type="url" placeholder="https://" value={draft.videoUrl} onChange={(e) => set({ videoUrl: e.target.value })} />
        </Field>
        <Field label={t("editor.color")} group>
          <ColorSwatches label={t("editor.color")} colors={BLOCK_COLORS} value={draft.color}
            onChange={(c) => set({ color: c as BlockColor })} colorLabel={(c) => t(`colors.${c as BlockColor}`)} />
        </Field>
      </form>
    </Modal>
  );
}
