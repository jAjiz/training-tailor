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
  bestByLoad, bestByReps, bestByTarget, bestDistance, findRecordEntry, formatDuration, formatTarget, targetOf,
} from "@/lib/training/records";
import { liftOneRms, listMovementPrs } from "@/lib/training/services/prs";
import { PrHistory, type RecordLine } from "./PrHistory";

export default async function MovementPrPage({ params }: { params: Promise<{ movement: string }> }) {
  const athlete = await requireAthletePage("/prs");
  let movement: string;
  try {
    movement = decodeURIComponent((await params).movement);
  } catch {
    notFound();
  }
  const { records: catalog } = await getDomainData();
  const entry = findRecordEntry(catalog, movement);
  if (!entry) notFound();
  const records = await listMovementPrs(prisma, athlete.id, movement);
  const [t, tc, locale] = await Promise.all([getTranslations("prs"), getTranslations("common"), getLocale()]);
  const num = (n: number) => formatDecimal(n, locale);
  const day = (d: Date) => formatDay(fromDbDate(d), locale, { day: "numeric", month: "short", year: "numeric" });
  const reps = (n: number) => t("repsCount", { reps: n });
  const load = (kg: number | null) => (kg === null ? t("bodyweight") : t("addedKg", { kg: num(kg) }));
  const metres = (m: number) => `${num(m)} m`;

  // Stored records always fit the entry (the publish deletes the rest), so each kind reads its own fields.
  let bests: RecordLine[] = [];
  let entries: (RecordLine & { id: string })[] = [];
  if (entry.kind === "lift") {
    const lifts = records.flatMap((r) => (r.kg !== null && r.reps !== null ? [{ id: r.id, kg: r.kg, reps: r.reps, achievedOn: r.achievedOn }] : []));
    bests = [...bestByReps(lifts).values()].sort((a, b) => a.reps - b.reps)
      .map((r) => ({ label: `${r.reps}RM`, value: `${num(r.kg)} ${t("kg")}` }));
    entries = lifts.map((r) => ({ id: r.id, label: day(r.achievedOn), value: `${num(r.kg)} ${t("kg")} × ${r.reps}` }));
  } else if (entry.kind === "reps") {
    const sets = records.flatMap((r) => (r.reps !== null ? [{ id: r.id, reps: r.reps, kg: r.kg, achievedOn: r.achievedOn }] : []));
    bests = bestByLoad(sets).map((r) => ({ label: load(r.kg), value: reps(r.reps) }));
    entries = sets.map((r) => ({ id: r.id, label: day(r.achievedOn), value: r.kg === null ? reps(r.reps) : `${reps(r.reps)} · ${load(r.kg)}` }));
  } else if (entry.kind === "distance") {
    const walks = records.flatMap((r) => (r.distanceM !== null ? [{ id: r.id, distanceM: r.distanceM, achievedOn: r.achievedOn }] : []));
    const longest = bestDistance(walks);
    bests = longest ? [{ label: t("bestDistance"), value: metres(longest.distanceM) }] : [];
    entries = walks.map((r) => ({ id: r.id, label: day(r.achievedOn), value: metres(r.distanceM) }));
  } else {
    const times = records.flatMap((r) => (r.seconds !== null
      ? [{ id: r.id, distanceM: r.distanceM, calories: r.calories, seconds: r.seconds, achievedOn: r.achievedOn }] : []));
    const targetLabel = (r: { distanceM: number | null; calories: number | null }) => {
      const target = targetOf(r);
      return target ? formatTarget(target) : "";
    };
    bests = bestByTarget(times, entry.targets).map((r) => ({ label: targetLabel(r), value: formatDuration(r.seconds) }));
    entries = times.map((r) => ({ id: r.id, label: day(r.achievedOn), value: `${targetLabel(r)} · ${formatDuration(r.seconds)}` }));
  }
  const oneRm = entry.kind === "lift" ? liftOneRms(records).get(movement) ?? null : null;

  return (
    <section className="flex flex-col gap-5 pt-4">
      <div>
        <IconButton href={`/prs?tab=${entry.tab}`} label={tc("back")}><ChevronLeft size={20} aria-hidden /></IconButton>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">{movement}</h1>
        {entry.kind === "lift" && <>
          <p className="text-[15px] text-muted">{t("current")}</p>
          <p className="type-display text-4xl tabular-nums">{oneRm ? `${num(oneRm.kg)} ${t("kg")}` : "—"}</p>
          {oneRm?.estimated && <p className="text-sm text-muted">{t("estimated")}</p>}
        </>}
      </div>
      <PrHistory movement={movement} today={todayIn(athlete.timezone)} entry={entry} bests={bests} entries={entries} />
    </section>
  );
}
