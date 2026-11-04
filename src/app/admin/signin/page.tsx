import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/Brand";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Card } from "@/components/ui/Card";

/** The admin's entry point: Google, back to the panel. Creates no profile. */
export default async function AdminSignInPage() {
  const t = await getTranslations("auth");
  return (
    <section className="mx-auto flex max-w-sm flex-col gap-6 pt-16">
      <Brand size="lg" className="self-center text-2xl" />
      <Card className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl">{t("adminTitle")}</h1>
          <p className="text-[15px] text-muted">{t("adminIntro")}</p>
        </div>
        <GoogleSignInButton callbackURL="/admin" />
      </Card>
    </section>
  );
}
