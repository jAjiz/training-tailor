import { redirect } from "next/navigation";
import { getDomainData } from "@/lib/domain/repository";
import { Equipment } from "@/lib/domain/types";
import { getUserId } from "@/lib/session";
import { TailorClient } from "./TailorClient";

export default async function TailorPage() {
  if (!(await getUserId())) redirect("/signin");
  const domain = await getDomainData();
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Tailor a workout</h1>
      <TailorClient
        movementNames={domain.movements.map((m) => m.name)}
        equipmentOptions={[...Equipment.options]}
        conditionLabels={Object.fromEntries(domain.contraindications.map((c) => [c.key, c.label]))}
      />
    </section>
  );
}
