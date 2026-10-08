import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getAthleteByUserId } from "@/lib/training/services/accounts";
import { findProgramByCode, getEnrollmentStatus } from "@/lib/training/services/enrollments";
import { JoinButton } from "./JoinButton";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const t = await getTranslations("join");
  const program = await findProgramByCode(prisma, code);
  if (!program) return <div className="pt-12"><EmptyState>{t("invalid")}</EmptyState></div>;

  const here = `/join/${code}`;
  const user = await getSessionUser();
  const athlete = user ? await getAthleteByUserId(prisma, user.id) : null;
  const status = athlete ? await getEnrollmentStatus(prisma, athlete.id, program.id) : null;
  if (status === "active") redirect(`/?program=${program.id}`);

  return (
    <section className="flex min-h-[70vh] flex-col justify-center">
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{program.name}</h1>
          <p className="text-sm text-muted">{t("by", { coach: program.coach.displayName })}</p>
        </div>
        {program.description && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/80">{program.description}</p>}
        {!user && (
          <>
            <p className="text-sm text-muted">{t("signInToJoin")}</p>
            <GoogleSignInButton callbackURL={`/onboarding?next=${encodeURIComponent(here)}`} />
          </>
        )}
        {user && !athlete && (
          <>
            <p className="text-sm text-muted">{t("needsProfile")}</p>
            <Button href={`/onboarding?next=${encodeURIComponent(here)}`} variant="primary" block>{t("continue")}</Button>
          </>
        )}
        {athlete && status === "removed" && <p role="alert" className="text-sm text-danger">{t("removed")}</p>}
        {athlete && status === null && <JoinButton code={code} />}
      </Card>
    </section>
  );
}
