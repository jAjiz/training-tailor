import { useTranslations } from "next-intl";
import { REMOVED_MOVEMENT, type TailoringResult } from "@/lib/engine/types";

/** An adapted block as the athlete reads it: the adapted text, what changed and why, and the safety note. */
export function AdaptedBlock({ tailored }: { tailored: TailoringResult }) {
  const t = useTranslations("adapt");
  return (
    <div className="flex flex-col gap-3">
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/80">{tailored.rawText}</p>
      {tailored.changes.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="type-label text-muted">{t("changes")}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {tailored.changes.map((c, i) => (
              <li key={i}>
                <span className="line-through text-muted">{c.original}</span>
                {" → "}
                {c.modified === REMOVED_MOVEMENT ? <i>{t("removed")}</i> : <b className="font-semibold">{c.modified}</b>}
                <span className="text-muted">: {c.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tailored.safetyNote && (
        <p data-color="yellow" className="rounded-xl bg-(--block-fill) px-3 py-2 text-sm text-(--block-ink)">{tailored.safetyNote}</p>
      )}
    </div>
  );
}
