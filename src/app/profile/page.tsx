import { redirect } from "next/navigation";
import { getDomainData } from "@/lib/domain/repository";
import { Equipment } from "@/lib/domain/types";
import { getUserId } from "@/lib/session";
import { loadProfile } from "@/lib/tailor-service";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage() {
  const userId = await getUserId();
  if (!userId) redirect("/signin");
  const [profile, domain] = await Promise.all([loadProfile(userId), getDomainData()]);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Profile</h1>
      <ProfileForm
        initial={profile}
        catalog={domain.contraindications.map((c) => ({ key: c.key, label: c.label, kind: c.kind }))}
        movementNames={domain.movements.map((m) => m.name)}
        equipmentOptions={[...Equipment.options]}
      />
    </section>
  );
}
