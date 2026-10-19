import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

const handlers = toNextJsHandler(auth);

/**
 * The admin plugin's HTTP endpoints (/api/auth/admin/*) change users with no audit row and skip the
 * app's rules, so they are not served; the app calls the plugin server-side through `auth.api.*`.
 */
function isAdminEndpoint(request: Request): boolean {
  let path = new URL(request.url).pathname;
  try { path = decodeURIComponent(path); } catch { return true; }
  return /^\/api\/auth\/admin(\/|$)/.test(path.toLowerCase().replace(/\/{2,}/g, "/"));
}

function withoutAdminEndpoints(handler: (request: Request) => Promise<Response>) {
  return (request: Request) => (isAdminEndpoint(request) ? Promise.resolve(new Response(null, { status: 404 })) : handler(request));
}

export const GET = withoutAdminEndpoints(handlers.GET);
export const POST = withoutAdminEndpoints(handlers.POST);
