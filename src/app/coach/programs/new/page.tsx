import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { requireCoachPage } from "@/lib/accounts";
import { addDays, mondayOf, todayIn } from "@/lib/training/dates";
import { NewProgramForm } from "./NewProgramForm";

export default async function NewProgramPage() {
  await requireCoachPage();
  const t = await getTranslations("programs");
  const today = todayIn("UTC");
  const nextMonday = mondayOf(today) === today ? today : addDays(mondayOf(today), 7);
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-3xl font-bold">{t("new")}</h1>
      <Card className="p-6"><NewProgramForm nextMonday={nextMonday} /></Card>
    </section>
  );
}
