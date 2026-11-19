import { getLocale, getTranslations } from "next-intl/server";
import { requireAthletePage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { formatDecimal } from "@/lib/format";
import { liftCatalog } from "@/lib/training/barbell";
import { bestByDistance, bestByLoad, formatDistance, formatDuration, recordKind, type RecordKind } from "@/lib/training/records";
import { liftOneRms, listPrs } from "@/lib/training/services/prs";
import { PrList, type RecordRow, type RecordTabs } from "./PrList";

export default async function PrsPage() {
  const athlete = await requireAthletePage("/prs");
  const [t, tp, locale] = await Promise.all([getTranslations(), getTranslations("prs"), getLocale()]);
  const [records, domain] = await Promise.all([listPrs(prisma, athlete.id), getDomainData()]);
  const num = (n: number) => formatDecimal(n, locale);

  // A movement shows in its library kind's tab and in the tab of any kind it has stored rows of.
  const kindsOf = new Map<string, Set<RecordKind>>();
  const addKind = (name: string, kind: RecordKind) => kindsOf.set(name, (kindsOf.get(name) ?? new Set()).add(kind));
  for (const m of domain.movements) {
    const kind = recordKind(m);
    if (kind) addKind(m.name, kind);
  }
  for (const r of records) addKind(r.movement, r.kind);
  const names = (kind: RecordKind) => [...kindsOf].filter(([, kinds]) => kinds.has(kind)).map(([name]) => name).sort((a, b) => a.localeCompare(b));

  const oneRms = liftOneRms(records);
  const liftRow = (name: string): RecordRow => {
    const r = oneRms.get(name);
    return { name, summary: r ? `${num(r.kg)} ${tp("kg")}` : null, estimated: r?.estimated ?? false };
  };
  const repsRow = (name: string): RecordRow => {
    const best = bestByLoad(records.flatMap((r) => (r.movement === name && r.kind === "reps" && r.reps !== null
      ? [{ reps: r.reps, kg: r.kg, achievedOn: r.achievedOn }] : [])))[0];
    const summary = !best ? null : best.kg === null
      ? tp("repsCount", { reps: best.reps })
      : `${tp("repsCount", { reps: best.reps })} · ${tp("addedKg", { kg: num(best.kg) })}`;
    return { name, summary, estimated: false };
  };
  const timeRow = (name: string): RecordRow => {
    const best = bestByDistance(records.flatMap((r) => (r.movement === name && r.kind === "time" && r.distanceM !== null && r.seconds !== null
      ? [{ distanceM: r.distanceM, seconds: r.seconds, achievedOn: r.achievedOn }] : [])))[0];
    return { name, summary: best ? `${formatDistance(best.distanceM)} · ${formatDuration(best.seconds)}` : null, estimated: false };
  };

  const lifts = new Set(names("lift"));
  const catalog = liftCatalog(domain.movements);
  const inCatalog = new Set(catalog.flatMap((g) => g.movements));
  const tabs: RecordTabs = {
    lift: [
      ...catalog.map((g) => ({ label: t(`patterns.${g.pattern}`), movements: g.movements.map(liftRow) })),
      { label: null, movements: [...lifts].filter((n) => !inCatalog.has(n)).map(liftRow) },
    ],
    reps: [{ label: null, movements: names("reps").map(repsRow) }],
    time: [{ label: null, movements: names("time").map(timeRow) }],
  };
  return (
    <section className="flex flex-col gap-5 pt-4">
      <h1 className="text-3xl">{tp("title")}</h1>
      <PrList tabs={tabs} />
    </section>
  );
}
