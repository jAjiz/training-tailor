import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireCoachPage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { listCoachPrograms } from "@/lib/training/services/programs";

export default async function CoachHome() {
  const coach = await requireCoachPage();
  const t = await getTranslations("programs");
  const programs = await listCoachPrograms(prisma, coach.id);
  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Link href="/coach/programs/new" className="rounded bg-black px-4 py-2 text-sm text-white">{t("new")}</Link>
      </div>
      {programs.length === 0 && <p className="text-neutral-600">{t("empty")}</p>}
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {programs.map((p) => (
          <li key={p.id}>
            <Link href={`/coach/programs/${p.id}`} className={`block rounded border p-4 ${p.archivedAt ? "opacity-60" : ""}`}>
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-neutral-600">
                {t(`kinds.${p.kind as "continuous" | "closed"}`)} · {t("athletes", { count: p._count.enrollments })}
                {p.archivedAt && ` · ${t("archived")}`}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
