"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Lock } from "lucide-react";
import { programPageHref, type ProgramPage } from "@/lib/routes";

/** `blocked`: the athlete's access is pending payment; the program stays listed, marked. */
export type ProgramOption = { id: string; name: string; blocked?: boolean };

/** Program name in the navy header; with several programs it is a select styled as the title that keeps the page. */
export function ProgramTitle({ programs, selected, page }: { programs: ProgramOption[]; selected: string; page: ProgramPage }) {
  const t = useTranslations();
  const router = useRouter();
  const current = programs.find((p) => p.id === selected);
  const name = current?.name ?? "";
  const lock = current?.blocked ? <Lock size={16} role="img" aria-label={t("blocked.pending")} className="shrink-0 opacity-70" /> : null;
  if (programs.length < 2) return <div className="flex min-w-0 items-center gap-2"><h1 className="truncate text-xl">{name}</h1>{lock}</div>;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="relative flex w-fit min-w-0 max-w-full items-center">
        <h1 className="sr-only">{name}</h1>
        <select aria-label={t("today.program")} value={selected} onChange={(e) => router.push(programPageHref(page, e.target.value))}
          className="type-display w-full cursor-pointer appearance-none truncate bg-transparent pr-7 text-xl text-on-chrome focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-chrome [&>option]:bg-surface [&>option]:font-normal [&>option]:not-italic [&>option]:normal-case [&>option]:text-foreground">
          {programs.map((p) => <option key={p.id} value={p.id}>{p.blocked ? `${p.name} · ${t("blocked.pending")}` : p.name}</option>)}
        </select>
        <ChevronDown size={20} aria-hidden className="pointer-events-none absolute right-0" />
      </div>
      {lock}
    </div>
  );
}
