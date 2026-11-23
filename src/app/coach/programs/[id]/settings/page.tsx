import { Card } from "@/components/ui/Card";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { paymentsEnabled } from "@/lib/stripe/client";
import { fromDbDate } from "@/lib/training/dates";
import { countLiveSubscriptions, countPendingCancellations, countPendingPriceSync, getStripeAccount } from "@/lib/training/services/payments";
import { getOwnedProgram, publishedWeeks } from "@/lib/training/services/programs";
import { CancellationRetry } from "../CancellationRetry";
import { ProgramHeader } from "../ProgramHeader";
import { PriceSyncRetry } from "./PriceSyncRetry";
import { PriceSection } from "./PriceSection";
import { ProgramSettingsForm } from "./ProgramSettingsForm";

export default async function ProgramSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const coach = await requireCoachPage();
  const { id } = await params;
  const program = await orNotFound(getOwnedProgram(prisma, coach.id, id));
  const locked = program.kind === "continuous" && (await publishedWeeks(prisma, program.id)).size > 0;
  const payments = paymentsEnabled();
  const account = payments ? await getStripeAccount(prisma, coach.id) : null;
  const liveSubscriptions = payments ? await countLiveSubscriptions(prisma, program.id) : 0;
  const pendingCancellations = payments ? await countPendingCancellations(prisma, program.id, ["archived", "made_free"]) : 0;
  const pendingPriceSync = payments ? await countPendingPriceSync(prisma, program.id) : 0;
  return (
    <section className="flex flex-col gap-6">
      <ProgramHeader name={program.name} />
      {pendingCancellations > 0 && <CancellationRetry programId={program.id} count={pendingCancellations} />}
      {pendingPriceSync > 0 && <PriceSyncRetry programId={program.id} count={pendingPriceSync} />}
      <Card className="p-6">
        <ProgramSettingsForm
          programId={program.id}
          kind={program.kind as "continuous" | "closed"}
          initial={{
            name: program.name,
            description: program.description ?? "",
            startDate: program.startDate ? fromDbDate(program.startDate) : null,
            weeks: program.weeks,
          }}
          startDateLocked={locked}
          archived={program.archivedAt !== null}
          tailoring={{ available: coach.tailoringEnabled, enabled: program.tailoringEnabled }}
        />
        {payments && (
          <div className="mt-6">
            <PriceSection
              programId={program.id}
              kind={program.kind as "continuous" | "closed"}
              priceAmount={program.priceAmount}
              currency={program.currency ?? account?.defaultCurrency ?? null}
              canCharge={Boolean(account?.chargesEnabled && account.defaultCurrency)}
              liveSubscriptions={liveSubscriptions}
              archived={program.archivedAt !== null}
            />
          </div>
        )}
      </Card>
    </section>
  );
}
