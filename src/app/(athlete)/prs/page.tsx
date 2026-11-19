import { getTranslations } from "next-intl/server";
import { requireAthletePage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { liftCatalog } from "@/lib/training/barbell";
import { liftOneRms, listPrs } from "@/lib/training/services/prs";
import { PrList } from "./PrList";

export default async function PrsPage() {
  const athlete = await requireAthletePage("/prs");
  const t = await getTranslations();
  const [records, domain] = await Promise.all([listPrs(prisma, athlete.id), getDomainData()]);
  const oneRms = liftOneRms(records);
  const groups = liftCatalog(domain.movements).map((g) => ({
    pattern: g.pattern,
    label: t(`patterns.${g.pattern}`),
    movements: g.movements.map((name) => ({ name, kg: oneRms.get(name)?.kg ?? null })),
  }));
  return (
    <section className="flex flex-col gap-5 pt-4">
      <h1 className="text-3xl">{t("prs.title")}</h1>
      <PrList groups={groups} />
    </section>
  );
}
