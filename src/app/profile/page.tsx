import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { Equipment } from "@/lib/domain/types";
import { normalizeProfile } from "@/lib/profile";
import { getUserId } from "@/lib/session";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage() {
  const userId = await getUserId();
  if (!userId) redirect("/signin");
  const [row, domain] = await Promise.all([prisma.athleteProfile.findUnique({ where: { userId } }), getDomainData()]);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Profile</h1>
      <ProfileForm
        initial={normalizeProfile(row?.data)}
        catalog={domain.contraindications.map((c) => ({ key: c.key, label: c.label, kind: c.kind }))}
        movementNames={domain.movements.map((m) => m.name)}
        equipmentOptions={[...Equipment.options]}
      />
    </section>
  );
}
