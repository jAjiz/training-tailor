import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireAthletePage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { findProgramByCode } from "@/lib/training/services/enrollments";
import { checkoutProgramId } from "@/lib/training/services/payments";
import { ConfirmPoller } from "./ConfirmPoller";

/** Where Checkout returns after paying. It grants nothing: it waits for the webhook to give the enrollment access. */
export default async function ConfirmPage({
  params, searchParams,
}: { params: Promise<{ code: string }>; searchParams: Promise<{ session?: string | string[] }> }) {
  const [{ code }, { session }] = await Promise.all([params, searchParams]);
  const athlete = await requireAthletePage(`/join/${code}`);
  const t = await getTranslations("join");
  const programId = (typeof session === "string" ? await checkoutProgramId(prisma, athlete.id, session) : null)
    ?? (await findProgramByCode(prisma, code))?.id;
  if (!programId) return <div className="pt-12"><EmptyState>{t("invalid")}</EmptyState></div>;
  return <ConfirmPoller programId={programId} />;
}
