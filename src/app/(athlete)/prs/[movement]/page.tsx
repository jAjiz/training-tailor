import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { IconButton } from "@/components/ui/IconButton";
import { requireAthletePage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { formatDay, formatDecimal } from "@/lib/format";
import { fromDbDate, todayIn } from "@/lib/training/dates";
import {
  bestByDistance, bestByLoad, bestByReps, formatDistance, formatDuration, recordKindOf, type RecordKind,
} from "@/lib/training/records";
import { liftOneRms, listMovementPrs } from "@/lib/training/services/prs";
import { PrHistory, type RecordSection } from "./PrHistory";

const KINDS: RecordKind[] = ["lift", "reps", "time"];

export default async function MovementPrPage({ params }: { params: Promise<{ movement: string }> }) {
  const athlete = await requireAthletePage("/prs");
  let movement: string;
  try {
    movement = decodeURIComponent((await params).movement);
  } catch {
    notFound();
  }
  const { movements } = await getDomainData();
  const formKind = recordKindOf(movement, movements);
  const records = await listMovementPrs(prisma, athlete.id, movement);
  // Rows keep their stored kind: a movement the library re-categorised still shows them, to read or delete.
  if (formKind === null && records.length === 0) notFound();
  const [t, tc, locale] = await Promise.all([getTranslations("prs"), getTranslations("common"), getLocale()]);
  const num = (n: number) => formatDecimal(n, locale);
  const day = (d: Date) => formatDay(fromDbDate(d), locale, { day: "numeric", month: "short", year: "numeric" });
  const reps = (n: number) => t("repsCount", { reps: n });
  const load = (kg: number | null) => (kg === null ? t("bodyweight") : t("addedKg", { kg: num(kg) }));

  const sections: RecordSection[] = KINDS
    .filter((k) => k === formKind || records.some((r) => r.kind === k))
    .sort((a, b) => Number(b === formKind) - Number(a === formKind))
    .map((kind) => {
      const rows = records.filter((r) => r.kind === kind);
      if (kind === "lift") {
        const lifts = rows.flatMap((r) => (r.kg !== null && r.reps !== null ? [{ id: r.id, kg: r.kg, reps: r.reps, achievedOn: r.achievedOn }] : []));
        return {
          kind,
          bests: [...bestByReps(lifts).values()].sort((a, b) => a.reps - b.reps)
            .map((r) => ({ label: `${r.reps}RM`, value: `${num(r.kg)} ${t("kg")}` })),
          entries: lifts.map((r) => ({ id: r.id, label: day(r.achievedOn), value: `${num(r.kg)} ${t("kg")} × ${r.reps}` })),
        };
      }
      if (kind === "reps") {
        const sets = rows.flatMap((r) => (r.reps !== null ? [{ id: r.id, reps: r.reps, kg: r.kg, achievedOn: r.achievedOn }] : []));
        return {
          kind,
          bests: bestByLoad(sets).map((r) => ({ label: load(r.kg), value: reps(r.reps) })),
          entries: sets.map((r) => ({ id: r.id, label: day(r.achievedOn), value: r.kg === null ? reps(r.reps) : `${reps(r.reps)} · ${load(r.kg)}` })),
        };
      }
      const times = rows.flatMap((r) => (r.distanceM !== null && r.seconds !== null
        ? [{ id: r.id, distanceM: r.distanceM, seconds: r.seconds, achievedOn: r.achievedOn }] : []));
      return {
        kind,
        bests: bestByDistance(times).map((r) => ({ label: formatDistance(r.distanceM), value: formatDuration(r.seconds) })),
        entries: times.map((r) => ({ id: r.id, label: day(r.achievedOn), value: `${formatDistance(r.distanceM)} · ${formatDuration(r.seconds)}` })),
      };
    });
  const oneRm = liftOneRms(records).get(movement) ?? null;

  return (
    <section className="flex flex-col gap-5 pt-4">
      <div>
        <IconButton href={`/prs?tab=${formKind ?? sections[0]?.kind ?? "lift"}`} label={tc("back")}><ChevronLeft size={20} aria-hidden /></IconButton>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">{movement}</h1>
        {(formKind === "lift" || oneRm) && <>
          <p className="text-[15px] text-muted">{t("current")}</p>
          <p className="type-display text-4xl tabular-nums">{oneRm ? `${num(oneRm.kg)} ${t("kg")}` : "—"}</p>
          {oneRm?.estimated && <p className="text-sm text-muted">{t("estimated")}</p>}
        </>}
      </div>
      <PrHistory movement={movement} today={todayIn(athlete.timezone)} formKind={formKind} sections={sections} />
    </section>
  );
}
