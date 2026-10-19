import { describe, it, expect, vi, beforeEach } from "vitest";

const getSessionContext = vi.fn();
const findAthlete = vi.fn();
vi.mock("@/lib/session", () => ({ getSessionContext: () => getSessionContext() }));
vi.mock("@/lib/db", () => ({ prisma: { athleteAccount: { findUnique: (a: unknown) => findAthlete(a) } } }));

import { engineUserId } from "@/lib/engine-access";

const user = { id: "u1", name: "U", email: "u@test.local", image: null };

beforeEach(() => {
  getSessionContext.mockReset();
  findAthlete.mockReset().mockResolvedValue(null);
});

describe("engineUserId", () => {
  it("returns the user id for a normal session", async () => {
    getSessionContext.mockResolvedValue({ user, role: null, impersonatedBy: null });
    expect(await engineUserId()).toEqual({ ok: true, userId: "u1" });
  });

  it("answers 401 without a session", async () => {
    getSessionContext.mockResolvedValue(null);
    const r = await engineUserId();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(401);
      expect(await r.response.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("answers 403 during an impersonation", async () => {
    getSessionContext.mockResolvedValue({ user, role: null, impersonatedBy: "admin1" });
    const r = await engineUserId();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      expect(await r.response.json()).toEqual({ error: "forbidden" });
    }
  });

  it("answers 403 to a disabled athlete", async () => {
    getSessionContext.mockResolvedValue({ user, role: null, impersonatedBy: null });
    findAthlete.mockResolvedValue({ disabledAt: new Date() });
    const r = await engineUserId();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      expect(await r.response.json()).toEqual({ error: "account_disabled" });
    }
  });
});
