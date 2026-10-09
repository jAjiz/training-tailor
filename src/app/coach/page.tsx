import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pill } from "@/components/ui/Pill";
import { requireCoachPage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { listCoachPrograms } from "@/lib/training/services/programs";

export default async function CoachHome() {
  const coach = await requireCoachPage();
  const t = await getTranslations("programs");
  const programs = await listCoachPrograms(prisma, coach.id);
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <Button href="/coach/programs/new" variant="primary"><Plus size={18} aria-hidden />{t("new")}</Button>
      </div>
      {programs.length === 0 && <EmptyState>{t("empty")}</EmptyState>}
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {programs.map((p) => (
          <li key={p.id}>
            <Link href={`/coach/programs/${p.id}`}
              className={cx("flex h-full flex-col gap-3 rounded-2xl border bg-surface p-5 transition hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-foreground",
                p.archivedAt && "opacity-60")}>
              <span className="text-lg font-bold">{p.name}</span>
              <span className="flex flex-wrap items-center gap-2">
                <Pill>{t(`kinds.${p.kind as "continuous" | "closed"}`)}</Pill>
                {p.archivedAt && <Pill>{t("archived")}</Pill>}
              </span>
              <span className="mt-auto flex items-center gap-1.5 text-sm text-muted">
                <Users size={16} aria-hidden />
                {t("athletes", { count: p._count.enrollments })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
