import { getTranslations } from "next-intl/server";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export default async function CoachSignInPage() {
  const t = await getTranslations("auth");
  return (
    <section className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-2xl font-semibold">{t("coachTitle")}</h1>
      <p className="text-sm text-neutral-600">{t("coachIntro")}</p>
      <GoogleSignInButton callbackURL="/coach/onboarding" />
    </section>
  );
}
