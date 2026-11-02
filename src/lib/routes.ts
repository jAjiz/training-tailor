const PUBLIC_PATHS = [/^\/signin$/, /^\/coach\/signin$/, /^\/admin\/signin$/, /^\/join\/[^/]+$/];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((re) => re.test(pathname));
}

export function signinPathFor(pathname: string): "/signin" | "/coach/signin" | "/admin/signin" {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "/admin/signin";
  return pathname === "/coach" || pathname.startsWith("/coach/") ? "/coach/signin" : "/signin";
}

/** A `next` redirect target, accepted only when it is a path on this site. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** Carries the selected program over to another athlete page ("/calendar" → "/calendar?program=…"). */
export function withProgram(path: string, program: string | null): string {
  return program ? `${path}?program=${encodeURIComponent(program)}` : path;
}

/** The athlete pages that hang from one program, under its header. */
export type ProgramPage = "today" | "calendar" | "board";

const BOARD_PATH = /^\/programs\/([^/]+)\/board$/;

/** A program page for `program`; without one, "/board" redirects to the athlete's first program. */
export function programPageHref(page: ProgramPage, program: string | null): string {
  if (page === "board") return program ? `/programs/${encodeURIComponent(program)}/board` : "/board";
  return withProgram(page === "today" ? "/" : "/calendar", program);
}

/** The program page at `pathname`, or null for any other page. */
export function programPageOf(pathname: string): ProgramPage | null {
  if (pathname === "/") return "today";
  if (pathname === "/calendar") return "calendar";
  return pathname === "/board" || BOARD_PATH.test(pathname) ? "board" : null;
}

/** The program a page shows: the id in "/programs/<id>/board", else `?program=`. */
export function programOf(pathname: string, programParam: string | null): string | null {
  const id = BOARD_PATH.exec(pathname)?.[1];
  return id ? decodeURIComponent(id) : programParam;
}
