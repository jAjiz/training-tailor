import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { ProgramPage } from "@/lib/routes";
import { ProgramTitle, type ProgramOption } from "./ProgramTitle";

/** The black band on top of the program pages (black in both themes): program, then e.g. the week strip. */
export function AthleteHeader({ programs, selected, page, start, children }: {
  programs: ProgramOption[]; selected: string; page: ProgramPage; start?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <header className="relative -mx-4 -mt-4 mb-4 bg-chrome px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-on-chrome">
      {/* The bell sits top right; the title keeps the same room on both sides (more when the week button sits top left) so it stays centred and never runs under them. */}
      <div className={start ? "px-[6.5rem]" : "px-[3.25rem]"}>
        <ProgramTitle programs={programs} selected={selected} page={page} />
      </div>
      {start && <div className="absolute left-3 top-[calc(env(safe-area-inset-top)+1rem)] flex items-center">{start}</div>}
      <div className="absolute right-3 top-[calc(env(safe-area-inset-top)+1rem)] flex items-center">
        <NotificationBell audience="athlete" href="/notifications" className="hover:bg-white/10 focus-visible:outline-on-chrome" />
      </div>
      {children}
    </header>
  );
}
