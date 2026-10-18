import { describe, it, expect, vi, beforeEach } from "vitest";
import { TrainingError } from "@/lib/training/errors";

const requireAdmin = vi.fn();
const getSessionContext = vi.fn();
const writeAudit = vi.fn();
const changeCoachStatus = vi.fn();
const deleteCoach = vi.fn();
const impersonateUser = vi.fn();
const stopImpersonating = vi.fn();
const redirect = vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { to }); });

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/accounts", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/session", () => ({ getSessionContext: () => getSessionContext() }));
vi.mock("@/lib/training/services/audit", () => ({ writeAudit: (...a: unknown[]) => writeAudit(...a) }));
vi.mock("@/lib/training/services/admin", () => ({
  changeCoachStatus: (...a: unknown[]) => changeCoachStatus(...a),
  deleteCoach: (...a: unknown[]) => deleteCoach(...a),
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { impersonateUser: (a: unknown) => impersonateUser(a), stopImpersonating: (a: unknown) => stopImpersonating(a) } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: (to: string) => redirect(to),
  unstable_rethrow: (e: unknown) => { if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e; },
}));

import {
  changeCoachStatusAction, deleteCoachAction, impersonateAction, stopImpersonatingAction,
} from "@/app/admin/actions";

const admin = { id: "admin1", name: "Admin", email: "admin@test.local", image: null };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(admin);
  getSessionContext.mockResolvedValue({ user: admin, role: "admin", impersonatedBy: null });
});

describe("admin actions", () => {
  it("changes a coach's status with the admin as actor", async () => {
    expect(await changeCoachStatusAction("c1", "approve")).toEqual({ ok: true, value: undefined });
    expect(changeCoachStatus).toHaveBeenCalledWith({}, "admin1", "c1", "approve");
  });

  it("refuses an unknown transition or a bad id without calling the service", async () => {
    expect(await changeCoachStatusAction("c1", "ban")).toEqual({ ok: false, code: "invalid_request" });
    expect(await changeCoachStatusAction("", "approve")).toEqual({ ok: false, code: "invalid_request" });
    expect(await deleteCoachAction("x".repeat(65), "a@b.c")).toEqual({ ok: false, code: "invalid_request" });
    expect(changeCoachStatus).not.toHaveBeenCalled();
    expect(deleteCoach).not.toHaveBeenCalled();
  });

  it("answers not_found to anyone who is not an admin", async () => {
    requireAdmin.mockRejectedValue(new TrainingError("not_found"));
    expect(await changeCoachStatusAction("c1", "approve")).toEqual({ ok: false, code: "not_found" });
    expect(changeCoachStatus).not.toHaveBeenCalled();
  });

  it("impersonates, audits the start with the zone and redirects to the zone", async () => {
    impersonateUser.mockResolvedValue({ user: { id: "u2", email: "coach@test.local" } });
    await expect(impersonateAction("u2", "coach")).rejects.toMatchObject({ to: "/coach" });
    expect(impersonateUser).toHaveBeenCalledWith({ body: { userId: "u2" }, headers: expect.any(Headers) });
    expect(writeAudit).toHaveBeenCalledWith({}, expect.objectContaining({
      actorUserId: "admin1", action: "impersonation.start", targetUserId: "u2", targetLabel: "coach@test.local",
      details: { zone: "coach" },
    }));
  });

  it("redirects an athlete impersonation to the athlete zone", async () => {
    impersonateUser.mockResolvedValue({ user: { id: "u3", email: "ath@test.local" } });
    await expect(impersonateAction("u3", "athlete")).rejects.toMatchObject({ to: "/" });
  });

  it("refuses a bad zone without impersonating", async () => {
    expect(await impersonateAction("u2", "admin")).toEqual({ ok: false, code: "invalid_request" });
    expect(impersonateUser).not.toHaveBeenCalled();
  });

  it("stops impersonating, audits the stop for the real admin and returns to the panel", async () => {
    getSessionContext.mockResolvedValue({ user: { ...admin, id: "u2", email: "coach@test.local" }, role: null, impersonatedBy: "admin1" });
    stopImpersonating.mockResolvedValue({});
    await expect(stopImpersonatingAction()).rejects.toMatchObject({ to: "/admin" });
    expect(stopImpersonating).toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith({}, expect.objectContaining({
      actorUserId: "admin1", action: "impersonation.stop", targetUserId: "u2",
    }));
  });

  it("refuses to stop when not impersonating", async () => {
    expect(await stopImpersonatingAction()).toEqual({ ok: false, code: "not_found" });
    expect(stopImpersonating).not.toHaveBeenCalled();
  });
});
