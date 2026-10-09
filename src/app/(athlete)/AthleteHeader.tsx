import { ProgramTitle, type ProgramOption } from "./ProgramTitle";

/** The black band on top of athlete pages (black in both themes, like Strivee): program, then e.g. the week strip. */
export function AthleteHeader({ programs, selected, basePath, children }: {
  programs: ProgramOption[]; selected: string; basePath: "/" | "/calendar"; children?: React.ReactNode;
}) {
  return (
    <header className="-mx-4 -mt-4 mb-4 bg-chrome px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-on-chrome">
      <ProgramTitle programs={programs} selected={selected} basePath={basePath} />
      {children}
    </header>
  );
}
