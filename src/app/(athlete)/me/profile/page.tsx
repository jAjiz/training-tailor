import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getDomainData } from "@/lib/domain/repository";
import { Equipment } from "@/lib/domain/types";
import { isEngineDisabled } from "@/lib/engine-access";
import { getUserId } from "@/lib/session";
import { loadProfile } from "@/lib/tailor-service";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage() {
  const userId = await getUserId();
  if (!userId) redirect("/signin");
  if (await isEngineDisabled(userId)) redirect("/disabled");
  const t = await getTranslations("profile");
  const [profile, domain] = await Promise.all([loadProfile(userId), getDomainData()]);
  return (
    <section className="flex flex-col gap-6 pt-4">
      <div className="flex flex-col gap-2">
        <Link href="/me" className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
          <ChevronLeft size={16} aria-hidden />{t("back")}
        </Link>
        <h1 className="text-3xl">{t("title")}</h1>
        <p className="text-[15px] text-muted">{t("intro")}</p>
      </div>
      <ProfileForm
        initial={profile}
        catalog={domain.contraindications.map((c) => ({ key: c.key, label: c.label, kind: c.kind }))}
        movementNames={domain.movements.map((m) => m.name)}
        equipmentOptions={[...Equipment.options]}
      />
    </section>
  );
}
