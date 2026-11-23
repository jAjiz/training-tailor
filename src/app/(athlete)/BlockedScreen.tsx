import { Lock } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { prisma } from "@/lib/db";
import { paymentsEnabled } from "@/lib/stripe/client";
import { formatPrice } from "@/lib/training/payments";
import { getBlockEnrollmentStatus, listAthletePrograms } from "@/lib/training/services/enrollments";
import { canCharge } from "@/lib/training/services/payments";
import { CheckoutButton } from "./join/[code]/JoinButton";

export type BlockedProgram = {
  id: string; coachId: string | null; name: string; kind: string; priceAmount: number | null; currency: string | null;
};

/** Shown instead of a program page while the athlete's access to it is pending payment, with the button to pay. */
export async function BlockedScreen({ program }: { program: BlockedProgram }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const subscription = program.kind === "continuous";
  const price = program.priceAmount !== null && program.currency
    ? formatPrice(program.priceAmount, program.currency, locale, subscription)
    : null;
  const canPay = price !== null && paymentsEnabled() && (await canCharge(prisma, program.coachId));
  return (
    <div className="pt-8">
      <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <Lock size={28} aria-hidden className="text-muted" />
        <h2 className="text-xl">{t("blocked.title", { program: program.name })}</h2>
        {price && <p className="type-display text-3xl tabular-nums">{price}</p>}
        <div className="mt-2 w-full">
          {canPay
            ? <CheckoutButton programId={program.id} subscription={subscription} />
            : <p role="status" className="text-sm text-muted">{t("join.paymentsUnavailable")}</p>}
        </div>
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
