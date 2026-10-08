"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function ProgramSelect({ programs, selected }: { programs: { id: string; name: string }[]; selected: string }) {
  const t = useTranslations("today");
  const router = useRouter();
  if (programs.length < 2) return <h1 className="text-center text-lg font-semibold">{programs[0]?.name}</h1>;
  return (
    <select aria-label={t("program")} value={selected} onChange={(e) => router.push(`/?program=${e.target.value}`)}
      className="w-full rounded border px-3 py-2 text-center font-semibold">
      {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}
