import { describe, it, expect, vi, beforeEach } from "vitest";

const handler = vi.hoisted(() => vi.fn(async (_req: Request) => new Response("ok")));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler: () => ({ GET: (r: Request) => handler(r), POST: (r: Request) => handler(r) }) }));

import { GET, POST } from "@/app/api/auth/[...all]/route";

const req = (path: string, method = "POST") => new Request(`http://localhost:3000${path}`, { method });

beforeEach(() => { handler.mockClear(); });

describe("auth route", () => {
  it.each([
    "/api/auth/admin/remove-user", "/api/auth/admin/set-role", "/api/auth/admin/impersonate-user",
    "/api/auth/admin/stop-impersonating", "/api/auth/admin", "/api/auth//admin/ban-user", "/api/auth/ADMIN/update-user",
    "/api/auth/%61dmin/set-user-password",
  ])("answers 404 to the admin plugin endpoint %s", async (path) => {
    expect((await POST(req(path))).status).toBe(404);
    expect((await GET(req(path, "GET"))).status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes every other auth request to Better Auth", async () => {
    expect(await (await POST(req("/api/auth/sign-in/social"))).text()).toBe("ok");
    expect(await (await GET(req("/api/auth/get-session", "GET"))).text()).toBe("ok");
    expect(await (await GET(req("/api/auth/callback/google?code=x", "GET"))).text()).toBe("ok");
    expect(handler).toHaveBeenCalledTimes(3);
  });
});
