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
      <h1 className="text-3xl font-bold">Tailor a workout</h1>
      <TailorClient
        movementNames={domain.movements.map((m) => m.name)}
        equipmentOptions={[...Equipment.options]}
        catalog={domain.contraindications.map((c) => ({ key: c.key, label: c.label, kind: c.kind }))}
      />
      <p className="text-xs text-muted">
        Not medical advice. Training Tailor suggests workout modifications; it does not diagnose or treat
        injuries. When in doubt, consult a qualified professional.
      </p>
    </section>
  );
}
