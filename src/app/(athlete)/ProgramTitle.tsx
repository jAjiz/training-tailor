"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

export type ProgramOption = { id: string; name: string };

/** Program name in the black header; with several programs it is a select styled as the title. */
export function ProgramTitle({ programs, selected, basePath }: { programs: ProgramOption[]; selected: string; basePath: "/" | "/calendar" }) {
  const t = useTranslations("today");
  const router = useRouter();
  const name = programs.find((p) => p.id === selected)?.name ?? "";
  if (programs.length < 2) return <h1 className="truncate text-center text-xl font-bold">{name}</h1>;
  return (
    <div className="relative mx-auto flex w-fit max-w-full items-center">
      <h1 className="sr-only">{name}</h1>
      <select aria-label={t("program")} value={selected} onChange={(e) => router.push(`${basePath}?program=${e.target.value}`)}
        className="max-w-full cursor-pointer appearance-none truncate bg-transparent pr-7 text-center text-xl font-bold text-on-chrome outline-none focus-visible:underline [&>option]:bg-surface [&>option]:text-foreground">
        {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <ChevronDown size={20} aria-hidden className="pointer-events-none absolute right-0" />
    </div>
  );
}
