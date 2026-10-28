"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { blockColor } from "@/components/training/colors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/controls";
import { cx } from "@/components/ui/cx";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { formatDay, formatDayRange } from "@/lib/format";
import { MAX_IMPORT_WEEKS } from "@/lib/import/schema";
import {
  allKeys, blockKey, isWeekImportable, selectedItems, targetWeek, toggleBlock, toggleWeek, weekKeys, type BlockKey,
} from "@/lib/import/selection";
import type { ImportPreview } from "@/lib/import/translate";
import { describeSets } from "@/lib/training/barbell";
import { addDays } from "@/lib/training/dates";
import { ERROR_CODES, type ActionResult, type ErrorCode } from "@/lib/training/errors";
import type { BlockInputValue } from "@/lib/training/schemas";
import { importBlocksAction } from "../../../block-actions";
import type { PlannerContext } from "./types";

const MAX_PDF_BYTES = 4 * 1024 * 1024;

type Props = {
  ctx: PlannerContext;
  /** Week indexes athletes already see: imported blocks there are visible straight away. */
  publishedWeeks: number[];
  onClose: () => void;
};

/** The route's codes; `forbidden` (impersonation) reads as the session one, anything unknown as internal. */
function toErrorCode(code: unknown): ErrorCode {
  if (code === "forbidden") return "unauthorized";
  return ERROR_CODES.includes(code as ErrorCode) ? (code as ErrorCode) : "internal";
}

function summary(block: BlockInputValue): string {
  if (block.kind === "barbell") return describeSets(block.sets, null).join(", ");
  return block.description.split("\n").find((line) => line.trim() !== "") ?? "";
}

/**
 * Upload a PDF, review its translated weeks (columns per day, one week at a time, every block selected)
 * and import the selection in one write. The preview lives only here: closing discards it.
 */
export function ImportDialog({ ctx, publishedWeeks, onClose }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const formId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"pick" | "translating" | "review" | "importing">("pick");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selection, setSelection] = useState<Set<BlockKey>>(new Set());
  const [week, setWeek] = useState(0);
  const [error, setError] = useState<ErrorCode | null>(null);
  const request = useRef<AbortController | null>(null);

  // Closing while the PDF is read drops the request; the result would have nowhere to go.
  useEffect(() => () => request.current?.abort(), []);

  async function translate(e: React.FormEvent) {
    e.preventDefault();
    if (!file || file.type !== "application/pdf") return setError("import_pdf_invalid");
    if (file.size > MAX_PDF_BYTES) return setError("import_pdf_too_large");
    const body = new FormData();
    body.set("programId", ctx.programId);
    body.set("pdf", file);
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setPhase("translating");
    let res: Response;
    let json: unknown;
    try {
      res = await fetch("/api/coach/import", { method: "POST", body, signal: controller.signal });
      json = await res.json().catch(() => null);
    } catch {
      if (controller.signal.aborted) return;
      setError("internal");
      setPhase("pick");
      return;
    }
    if (!res.ok) {
      setError(toErrorCode((json as { error?: unknown } | null)?.error));
      setPhase("pick");
      return;
    }
    const result = json as ImportPreview;
    setPreview(result);
    setSelection(allKeys(result));
    setWeek(0);
    setPhase("review");
  }

  async function confirm() {
    if (!preview) return;
    setPhase("importing");
    setError(null);
    let r: ActionResult;
    try {
      r = await importBlocksAction({ programId: ctx.programId, items: selectedItems(selection, preview, ctx) });
    } catch {
      r = { ok: false, code: "internal" };
    }
    if (r.ok) {
      onClose();
      router.refresh();
    } else {
      setError(r.code);
      setPhase("review");
    }
  }

  const errorLine = error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>;

  if (!preview) {
    return (
      <Modal title={t("import.tooltip")} closeLabel={t("common.close")} onClose={onClose} size="lg"
        footer={<>
          <Button type="button" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" form={formId} variant="primary" disabled={phase === "translating"}>{t("import.read")}</Button>
        </>}>
        <form id={formId} onSubmit={translate} className="flex flex-col gap-4">
          <Field label={t("import.file")}>
            <Input type="file" accept="application/pdf" disabled={phase === "translating"}
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
          </Field>
          <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">{t("import.dataNotice")}</p>
          {phase === "translating" && <p role="status" className="text-sm text-muted">{t("import.reading")}</p>}
          {errorLine}
        </form>
      </Modal>
    );
  }

  const current = preview.weeks[week];
  const target = targetWeek(ctx, week);
  const importable = isWeekImportable(ctx, week);
  const keys = weekKeys(preview, week);
  const weekChecked = keys.length > 0 && keys.every((k) => selection.has(k));
  const count = selectedItems(selection, preview, ctx).length;
  const targetLabel = ctx.startDate
    ? t("import.datedWeek", {
      week: target + 1,
      dates: formatDayRange(addDays(ctx.startDate, target * 7), addDays(ctx.startDate, target * 7 + 6), locale),
    })
    : t("planner.week", { week: target + 1 });
  const dayLabel = (day: number) => ctx.startDate
    ? formatDay(addDays(ctx.startDate, target * 7 + day), locale)
    : t("planner.dayNumber", { day: day + 1 });

  return (
    <Modal title={t("import.tooltip")} closeLabel={t("common.close")} onClose={onClose} size="lg"
      footer={<>
        <span className="mr-auto text-sm text-muted">{t("import.selected", { count })}</span>
        <Button type="button" onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="button" variant="primary" onClick={() => void confirm()} disabled={count === 0 || phase === "importing"}>
          {t("import.confirm")}
        </Button>
      </>}>
      <div className="flex flex-col gap-4">
        {(preview.weeksFound > MAX_IMPORT_WEEKS || !preview.daysNamed || preview.dropped > 0) && (
          <ul className="flex flex-col gap-1 rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
            {preview.weeksFound > MAX_IMPORT_WEEKS && <li>{t("import.tooManyWeeks", { found: preview.weeksFound, max: MAX_IMPORT_WEEKS })}</li>}
            {!preview.daysNamed && <li>{t("import.daysUnnamed")}</li>}
            {preview.dropped > 0 && <li>{t("import.dropped", { count: preview.dropped })}</li>}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <IconButton label={t("planner.prevWeek")} disabled={week === 0} onClick={() => setWeek(week - 1)}>
              <ChevronLeft size={20} aria-hidden />
            </IconButton>
            <span className="min-w-24 text-center text-sm font-bold">{t("import.weekOf", { week: week + 1, total: preview.weeks.length })}</span>
            <IconButton label={t("planner.nextWeek")} disabled={week === preview.weeks.length - 1} onClick={() => setWeek(week + 1)}>
              <ChevronRight size={20} aria-hidden />
            </IconButton>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4 accent-primary" aria-label={t("import.selectWeek")}
              checked={weekChecked} disabled={!importable || keys.length === 0}
              onChange={() => setSelection(toggleWeek(selection, preview, week))} />
            <span>{t("import.weekTarget", { week: week + 1, target: targetLabel })}</span>
          </label>
          {current.label && <span className="text-sm text-muted">{current.label}</span>}
        </div>

        {!importable
          ? <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">{t("import.pastEnd")}</p>
          : publishedWeeks.includes(target) && <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">{t("import.published")}</p>}
        {keys.length === 0 && <p className="text-sm text-muted">{t("import.weekEmpty")}</p>}

        <div className={cx("-mx-6 overflow-x-auto px-6 pb-2", !importable && "opacity-50")}>
          <div className="grid min-w-[840px] grid-cols-7 gap-2">
            {Array.from({ length: 7 }, (_, day) => {
              const blocks = current.days.find((d) => d.day === day)?.blocks ?? [];
              return (
                <div key={day} className="flex min-w-0 flex-col gap-2">
                  <h3 className="truncate px-1 text-xs font-bold first-letter:uppercase">{dayLabel(day)}</h3>
                  {blocks.map((block, i) => {
                    const key = blockKey(week, day, i);
                    const on = selection.has(key);
                    const heading = block.title ?? (block.kind === "barbell" ? block.movement : null) ?? t(`editor.kinds.${block.kind}`);
                    return (
                      <label key={key} data-color={blockColor(block.color)}
                        className={cx("flex cursor-pointer flex-col gap-1.5 rounded-xl bg-(--block-fill) p-2.5 transition-opacity",
                          (!on || !importable) && "opacity-50", !importable && "cursor-not-allowed")}>
                        <span className="flex items-start gap-1.5">
                          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" aria-label={heading} checked={on} disabled={!importable}
                            onChange={() => setSelection(toggleBlock(selection, key))} />
                          <span className="min-w-0 text-sm font-bold leading-snug">{heading}</span>
                        </span>
                        <span className="truncate text-xs text-foreground/80">{summary(block)}</span>
                        <Pill className="w-fit">{t(`editor.kinds.${block.kind}`)}</Pill>
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        {errorLine}
      </div>
    </Modal>
  );
}
