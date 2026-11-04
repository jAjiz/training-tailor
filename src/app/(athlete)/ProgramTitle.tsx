"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { programPageHref, type ProgramPage } from "@/lib/routes";

export type ProgramOption = { id: string; name: string };

/** Program name in the navy header; with several programs it is a select styled as the title that keeps the page. */
export function ProgramTitle({ programs, selected, page }: { programs: ProgramOption[]; selected: string; page: ProgramPage }) {
  const t = useTranslations("today");
  const router = useRouter();
  const name = programs.find((p) => p.id === selected)?.name ?? "";
  if (programs.length < 2) return <h1 className="truncate text-xl">{name}</h1>;
  return (
    <div className="relative flex w-fit min-w-0 max-w-full items-center">
      <h1 className="sr-only">{name}</h1>
      <select aria-label={t("program")} value={selected} onChange={(e) => router.push(programPageHref(page, e.target.value))}
        className="type-display w-full cursor-pointer appearance-none truncate bg-transparent pr-7 text-xl text-on-chrome outline-none focus-visible:underline [&>option]:bg-surface [&>option]:font-normal [&>option]:not-italic [&>option]:normal-case [&>option]:text-foreground">
        {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <ChevronDown size={20} aria-hidden className="pointer-events-none absolute right-0" />
    </div>
  );
}
