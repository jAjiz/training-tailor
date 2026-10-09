import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/Brand";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Card } from "@/components/ui/Card";
import { safeNext } from "@/lib/routes";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <section className="flex min-h-[80vh] flex-col justify-center gap-8">
      <Brand className="self-center text-xl" />
      <Card className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">{t("athleteTitle")}</h1>
          <p className="text-[15px] text-muted">{t("athleteIntro")}</p>
        </div>
        <GoogleSignInButton callbackURL={`/onboarding?next=${encodeURIComponent(safeNext(next))}`} />
      </Card>
    </section>
  );
}
