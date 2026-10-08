import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isPublicPath, signinPathFor } from "@/lib/routes";

/** Only checks that a session exists; pages check the account (src/lib/accounts.ts). */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session) return NextResponse.next();
  const target = new URL(signinPathFor(pathname), request.url);
  if (target.pathname === "/signin" && pathname !== "/") target.searchParams.set("next", pathname + search);
  return NextResponse.redirect(target);
}

// API routes check the session themselves and answer 401.
export const config = { matcher: ["/((?!api/|_next/|favicon.ico).*)"] };
