import { getLocale, getTranslations } from "next-intl/server";
import { requireAthletePage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import type { RecordLabel } from "@/lib/domain/types";
import { formatDecimal } from "@/lib/format";
import { bestByLoad, bestByTarget, bestDistance, findRecordEntry, formatDuration, formatTarget, targetOf } from "@/lib/training/records";
import { liftOneRms, listPrs } from "@/lib/training/services/prs";
import { PrList, type RecordGroup, type RecordRow, type RecordTabs } from "./PrList";

export default async function PrsPage() {
  const athlete = await requireAthletePage("/prs");
  const [tp, locale] = await Promise.all([getTranslations("prs"), getLocale()]);
  const [records, { records: catalog }] = await Promise.all([listPrs(prisma, athlete.id), getDomainData()]);
  const num = (n: number) => formatDecimal(n, locale);
  const rowsOf = (name: string) => records.filter((r) => r.movement === name);
  const oneRms = liftOneRms(records);

  /** A movement's summary: the current 1RM, the best reps, the longest distance, or the best time of its first target with one. */
  const row = (name: string): RecordRow => {
    const entry = findRecordEntry(catalog, name);
    if (entry?.kind === "lift") {
      const r = oneRms.get(name);
      return { name, summary: r ? `${num(r.kg)} ${tp("kg")}` : null, estimated: r?.estimated ?? false };
    }
    if (entry?.kind === "reps") {
      const best = bestByLoad(rowsOf(name).flatMap((r) => (r.reps !== null ? [{ reps: r.reps, kg: r.kg, achievedOn: r.achievedOn }] : [])))[0];
      const summary = !best ? null : best.kg === null
        ? tp("repsCount", { reps: best.reps })
        : `${tp("repsCount", { reps: best.reps })} · ${tp("addedKg", { kg: num(best.kg) })}`;
      return { name, summary, estimated: false };
    }
    if (entry?.kind === "distance") {
      const best = bestDistance(rowsOf(name).flatMap((r) => (r.distanceM !== null ? [{ distanceM: r.distanceM, achievedOn: r.achievedOn }] : [])));
      return { name, summary: best ? `${num(best.distanceM)} m` : null, estimated: false };
    }
    const times = rowsOf(name).flatMap((r) => (r.seconds !== null
      ? [{ distanceM: r.distanceM, calories: r.calories, seconds: r.seconds, achievedOn: r.achievedOn }] : []));
    const best = entry?.kind === "time" ? bestByTarget(times, entry.targets)[0] : undefined;
    const target = best ? targetOf(best) : null;
    return { name, summary: best && target ? `${formatTarget(target)} · ${formatDuration(best.seconds)}` : null, estimated: false };
  };

  const label = (l: RecordLabel) => (locale.startsWith("es") ? l.es : l.en);
  const groups = (list: { label: RecordLabel; entries: { movement: string }[] }[]): RecordGroup[] =>
    list.map((g) => ({ label: list.length > 1 ? label(g.label) : null, movements: g.entries.map((e) => row(e.movement)) }));
  const tabs: RecordTabs = { lift: groups(catalog.lift), gymnastics: groups(catalog.gymnastics), cardio: groups(catalog.cardio) };
  return (
    <section className="flex flex-col gap-5 pt-4">
      <h1 className="text-3xl">{tp("title")}</h1>
      <PrList tabs={tabs} />
    </section>
  );
}
