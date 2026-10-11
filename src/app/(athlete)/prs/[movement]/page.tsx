import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { IconButton } from "@/components/ui/IconButton";
import { requireAthletePage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { formatDay } from "@/lib/format";
import { isLiftMovement } from "@/lib/training/barbell";
import { fromDbDate, todayIn } from "@/lib/training/dates";
import { currentOneRm } from "@/lib/training/prs";
import { listMovementPrs } from "@/lib/training/services/prs";
import { PrHistory } from "./PrHistory";

export default async function MovementPrPage({ params }: { params: Promise<{ movement: string }> }) {
  const athlete = await requireAthletePage("/prs");
  const movement = decodeURIComponent((await params).movement);
  const { movements } = await getDomainData();
  if (!isLiftMovement(movement, movements)) notFound();
  const [t, tc] = await Promise.all([getTranslations("prs"), getTranslations("common")]);
  const locale = await getLocale();
  const records = await listMovementPrs(prisma, athlete.id, movement);
  const current = currentOneRm(records);
  return (
    <section className="flex flex-col gap-5 pt-4">
      <div>
        <IconButton href="/prs" label={tc("back")}><ChevronLeft size={20} aria-hidden /></IconButton>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{movement}</h1>
        <p className="text-[15px] text-muted">{t("current")}</p>
        <p className="text-4xl font-bold tabular-nums">{current !== null ? `${current} ${t("kg")}` : "—"}</p>
      </div>
      <PrHistory movement={movement} today={todayIn(athlete.timezone)}
        entries={records.map((r) => ({ id: r.id, kg: r.kg, label: formatDay(fromDbDate(r.achievedOn), locale, { day: "numeric", month: "short", year: "numeric" }) }))} />
    </section>
  );
}
