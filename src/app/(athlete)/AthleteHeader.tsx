import Link from "next/link";
import { useTranslations } from "next-intl";
import { Megaphone } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ProgramTitle, type ProgramOption } from "./ProgramTitle";

const ICON = "grid size-9 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-on-chrome";

/** The black band on top of athlete pages (black in both themes, like Strivee): program, then e.g. the week strip. */
export function AthleteHeader({ programs, selected, basePath, children }: {
  programs: ProgramOption[]; selected: string; basePath: "/" | "/calendar"; children?: React.ReactNode;
}) {
  const t = useTranslations("board");
  return (
    <header className="relative -mx-4 -mt-4 mb-4 bg-chrome px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-on-chrome">
      {/* Two icons sit top right; the title keeps the same room on both sides so it stays centred and never runs under them. */}
      <div className="px-[4.75rem]">
        <ProgramTitle programs={programs} selected={selected} basePath={basePath} />
      </div>
      <div className="absolute right-3 top-[calc(env(safe-area-inset-top)+1rem)] flex items-center gap-1">
        <Link href={`/programs/${selected}/board`} aria-label={t("open")} title={t("open")} className={ICON}>
          <Megaphone size={20} aria-hidden />
        </Link>
        <NotificationBell audience="athlete" href="/notifications" className="hover:bg-white/10 focus-visible:outline-on-chrome" />
      </div>
      {children}
    </header>
  );
}
