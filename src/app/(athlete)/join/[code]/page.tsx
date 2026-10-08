import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getAthleteByUserId } from "@/lib/training/services/accounts";
import { findProgramByCode, getEnrollmentStatus } from "@/lib/training/services/enrollments";
import { JoinButton } from "./JoinButton";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const t = await getTranslations("join");
  const program = await findProgramByCode(prisma, code);
  if (!program) return <p className="py-12">{t("invalid")}</p>;

  const here = `/join/${code}`;
  const user = await getSessionUser();
  const athlete = user ? await getAthleteByUserId(prisma, user.id) : null;
  const status = athlete ? await getEnrollmentStatus(prisma, athlete.id, program.id) : null;
  if (status === "active") redirect(`/?program=${program.id}`);

  return (
    <section className="flex flex-col gap-4 py-8">
      <h1 className="text-2xl font-semibold">{program.name}</h1>
      <p className="text-sm text-neutral-600">{t("by", { coach: program.coach.displayName })}</p>
      {program.description && <p className="whitespace-pre-wrap text-sm">{program.description}</p>}
      {!user && (
        <>
          <p className="text-sm">{t("signInToJoin")}</p>
          <GoogleSignInButton callbackURL={`/onboarding?next=${encodeURIComponent(here)}`} />
        </>
      )}
      {user && !athlete && (
        <>
          <p className="text-sm">{t("needsProfile")}</p>
          <Link href={`/onboarding?next=${encodeURIComponent(here)}`} className="w-fit rounded bg-black px-4 py-2 text-white">{t("continue")}</Link>
        </>
      )}
      {athlete && status === "removed" && <p className="text-sm text-red-700">{t("removed")}</p>}
      {athlete && status === null && <JoinButton code={code} />}
    </section>
  );
}
