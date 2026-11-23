import { Lock } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/training/payments";
import { getBlockEnrollmentStatus, listAthletePrograms } from "@/lib/training/services/enrollments";

export type BlockedProgram = { name: string; kind: string; priceAmount: number | null; currency: string | null };

/** Shown instead of a program page while the athlete's access to it is pending payment. */
export async function BlockedScreen({ program }: { program: BlockedProgram }) {
  const [t, locale] = await Promise.all([getTranslations("blocked"), getLocale()]);
  const price = program.priceAmount !== null && program.currency
    ? formatPrice(program.priceAmount, program.currency, locale, program.kind === "continuous")
    : null;
  return (
    <div className="pt-8">
      <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <Lock size={28} aria-hidden className="text-muted" />
        <h2 className="text-xl">{t("title", { program: program.name })}</h2>
        {price && <p className="type-display text-3xl tabular-nums">{price}</p>}
      </Card>
    </div>
  );
}

/** `BlockedScreen` for a page reached by block id (log, leaderboard), whose program it looks up. */
export async function BlockedBlockScreen({ athleteId, blockId }: { athleteId: string; blockId: string }) {
  const [status, enrollments] = await Promise.all([
    getBlockEnrollmentStatus(prisma, athleteId, blockId),
    listAthletePrograms(prisma, athleteId),
  ]);
  const enrollment = enrollments.find((e) => e.programId === status?.programId);
  if (!enrollment) notFound();
  return <BlockedScreen program={enrollment.program} />;
}
