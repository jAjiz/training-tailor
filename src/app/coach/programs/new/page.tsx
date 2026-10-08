import { getTranslations } from "next-intl/server";
import { requireCoachPage } from "@/lib/accounts";
import { addDays, mondayOf, todayIn } from "@/lib/training/dates";
import { NewProgramForm } from "./NewProgramForm";

export default async function NewProgramPage() {
  await requireCoachPage();
  const t = await getTranslations("programs");
  const today = todayIn("UTC");
  const nextMonday = mondayOf(today) === today ? today : addDays(mondayOf(today), 7);
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("new")}</h1>
      <NewProgramForm nextMonday={nextMonday} />
    </section>
  );
}
