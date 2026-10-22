import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/** Shown instead of a program page the athlete left or was removed from, with a way back to the day view. */
export async function NotInProgram() {
  const t = await getTranslations("board");
  return (
    <div className="pt-8">
      <EmptyState>
        <p>{t("notInProgram")}</p>
        <div className="mt-4"><Button href="/" variant="tinted" size="sm">{t("toToday")}</Button></div>
      </EmptyState>
    </div>
  );
}
