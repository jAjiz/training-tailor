import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/Brand";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Card } from "@/components/ui/Card";

export default async function CoachSignInPage() {
  const t = await getTranslations("auth");
  return (
    <section className="mx-auto flex max-w-sm flex-col gap-6 pt-16">
      <Brand size="lg" className="self-center text-2xl" />
      <Card className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl">{t("coachTitle")}</h1>
          <p className="text-[15px] text-muted">{t("coachIntro")}</p>
        </div>
        <GoogleSignInButton callbackURL="/coach/onboarding" />
      </Card>
    </section>
  );
}
