const PUBLIC_PATHS = [/^\/signin$/, /^\/coach\/signin$/, /^\/join\/[^/]+$/];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((re) => re.test(pathname));
}

export function signinPathFor(pathname: string): "/signin" | "/coach/signin" {
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
