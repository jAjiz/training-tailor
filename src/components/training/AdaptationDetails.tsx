import { useTranslations } from "next-intl";
import { REMOVED_MOVEMENT } from "@/lib/engine/types";
import type { AdaptationSnapshot } from "@/lib/training/adaptation-types";

/** What a coach sees of an adapted result: the adapted text, what changed, the safety note and the athlete's own words. */
export function AdaptationDetails({ adaptation }: { adaptation: AdaptationSnapshot }) {
  const t = useTranslations("coachResults");
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium underline">{t("adaptedDetails")}</summary>
      <div className="mt-2 flex max-w-prose flex-col gap-3 whitespace-normal">
        <p className="whitespace-pre-wrap leading-relaxed text-foreground/80">{adaptation.text}</p>
        {adaptation.changes.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="type-label text-muted">{t("adaptedChanges")}</p>
            <ul className="flex flex-col gap-1">
              {adaptation.changes.map((c, i) => (
                <li key={i}>
                  <span className="line-through text-muted">{c.original}</span>
                  {" → "}
                  {c.modified === REMOVED_MOVEMENT ? <i>{t("adaptedRemoved")}</i> : <b className="font-semibold">{c.modified}</b>}
                  <span className="text-muted">: {c.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {adaptation.safetyNote && (
          <p data-color="yellow" className="rounded-xl bg-(--block-fill) px-3 py-2 text-(--block-ink)">{adaptation.safetyNote}</p>
        )}
        {adaptation.situation.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="type-label text-muted">{t("adaptedSituation")}</p>
            <ul className="flex flex-col gap-1 text-muted">
              {adaptation.situation.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
