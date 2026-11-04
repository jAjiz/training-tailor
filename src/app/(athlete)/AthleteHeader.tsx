import { Logo } from "@/components/Brand";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { ProgramPage } from "@/lib/routes";
import { ProgramTitle, type ProgramOption } from "./ProgramTitle";

/** The navy band on top of the program pages (navy in both themes): logo, program, then e.g. the week strip. */
export function AthleteHeader({ programs, selected, page, start, children }: {
  programs: ProgramOption[]; selected: string; page: ProgramPage; start?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <header className="-mx-4 -mt-4 mb-4 bg-chrome px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-on-chrome">
      <div className="flex items-center gap-2">
        <Logo onChrome className="size-7" />
        <div className="min-w-0 flex-1">
          <ProgramTitle programs={programs} selected={selected} page={page} />
        </div>
        {start}
        <NotificationBell audience="athlete" href="/notifications" className="hover:bg-white/10 focus-visible:outline-on-chrome" />
      </div>
      {children}
    </header>
  );
}
