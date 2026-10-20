import Link from "next/link";
import { useTranslations } from "next-intl";
import { Megaphone } from "lucide-react";
import { ProgramTitle, type ProgramOption } from "./ProgramTitle";

/** The black band on top of athlete pages (black in both themes, like Strivee): program, then e.g. the week strip. */
export function AthleteHeader({ programs, selected, basePath, children }: {
  programs: ProgramOption[]; selected: string; basePath: "/" | "/calendar"; children?: React.ReactNode;
}) {
  const t = useTranslations("board");
  return (
    <header className="relative -mx-4 -mt-4 mb-4 bg-chrome px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-on-chrome">
      <ProgramTitle programs={programs} selected={selected} basePath={basePath} />
      <Link href={`/programs/${selected}/board`} aria-label={t("open")} title={t("open")}
        className="absolute right-3 top-[calc(env(safe-area-inset-top)+1rem)] grid size-9 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-on-chrome">
        <Megaphone size={20} aria-hidden />
      </Link>
      {children}
    </header>
  );
}
