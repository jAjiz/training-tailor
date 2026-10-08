import { getTranslations } from "next-intl/server";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { safeNext } from "@/lib/routes";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <section className="flex flex-col gap-6 py-12">
      <h1 className="text-2xl font-semibold">{t("athleteTitle")}</h1>
      <p className="text-sm text-neutral-600">{t("athleteIntro")}</p>
      <GoogleSignInButton callbackURL={`/onboarding?next=${encodeURIComponent(safeNext(next))}`} />
    </section>
  );
}
