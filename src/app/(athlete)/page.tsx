import { getTranslations } from "next-intl/server";

export default async function TodayPage() {
  const t = await getTranslations("nav");
  return <h1 className="text-xl font-semibold">{t("today")}</h1>;
}
