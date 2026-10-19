import { describe, it, expect, vi, beforeEach } from "vitest";
import { TrainingError } from "@/lib/training/errors";

const requireAdmin = vi.fn();
const getSessionContext = vi.fn();
const writeAudit = vi.fn();
const changeCoachStatus = vi.fn();
const deleteCoach = vi.fn();
const impersonateUser = vi.fn();
const stopImpersonating = vi.fn();
const findUser = vi.fn();
const redirect = vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { to }); });

const prisma = vi.hoisted(() => ({ user: { findUnique: (...a: unknown[]) => findUser(...a) } }));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/accounts", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/session", () => ({ getSessionContext: () => getSessionContext() }));
vi.mock("@/lib/training/services/audit", () => ({ writeAudit: (...a: unknown[]) => writeAudit(...a) }));
vi.mock("@/lib/training/services/admin", () => ({
  changeCoachStatus: (...a: unknown[]) => changeCoachStatus(...a),
  deleteCoach: (...a: unknown[]) => deleteCoach(...a),
}));
vi.mock("@/lib/auth", () => ({
  IMPERSONATION_SECONDS: 3600,
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
    expect(changeCoachStatus).toHaveBeenCalledWith(prisma, "admin1", "c1", "approve");
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

  it("audits the start with the zone, then impersonates and redirects to the zone", async () => {
    findUser.mockResolvedValue({ id: "u2", email: "coach@test.local", role: null });
    impersonateUser.mockResolvedValue({ user: { id: "u2", email: "coach@test.local" } });
    await expect(impersonateAction("u2", "coach")).rejects.toMatchObject({ to: "/coach" });
    expect(impersonateUser).toHaveBeenCalledWith({ body: { userId: "u2" }, headers: expect.any(Headers) });
    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(writeAudit).toHaveBeenCalledWith(prisma, expect.objectContaining({
      actorUserId: "admin1", action: "impersonation.start", targetUserId: "u2", targetType: "user", targetId: "u2",
      targetLabel: "coach@test.local", details: { zone: "coach", expiresAt: expect.any(String) },
    }));
    expect(writeAudit.mock.invocationCallOrder[0]).toBeLessThan(impersonateUser.mock.invocationCallOrder[0]);
    // One read, before impersonateUser: a read afterwards would let Better Auth overwrite the impersonation cookie.
    expect(getSessionContext).toHaveBeenCalledTimes(1);
    expect(getSessionContext.mock.invocationCallOrder[0]).toBeLessThan(impersonateUser.mock.invocationCallOrder[0]);
  });

  it("records the session's end on the start row", async () => {
    findUser.mockResolvedValue({ id: "u2", email: "coach@test.local", role: null });
    impersonateUser.mockResolvedValue({});
    const before = Date.now();
    await expect(impersonateAction("u2", "coach")).rejects.toMatchObject({ to: "/coach" });
    const { expiresAt } = writeAudit.mock.calls[0][1].details;
    expect(new Date(expiresAt).getTime()).toBeGreaterThanOrEqual(before + 3600_000);
  });

  it("writes a failed row when the plugin refuses the start", async () => {
    findUser.mockResolvedValue({ id: "u2", email: "coach@test.local", role: null });
    impersonateUser.mockRejectedValue(new Error("plugin down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await impersonateAction("u2", "coach")).toEqual({ ok: false, code: "internal" });
    expect(writeAudit.mock.calls.map((c) => c[1].action)).toEqual(["impersonation.start", "impersonation.failed"]);
    spy.mockRestore();
  });

  it("does not impersonate when the start cannot be audited", async () => {
    findUser.mockResolvedValue({ id: "u2", email: "coach@test.local", role: null });
    writeAudit.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await impersonateAction("u2", "coach")).toEqual({ ok: false, code: "internal" });
    expect(impersonateUser).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("refuses an unknown user or another admin without auditing or impersonating", async () => {
    findUser.mockResolvedValueOnce(null);
    expect(await impersonateAction("nobody", "coach")).toEqual({ ok: false, code: "not_found" });
    findUser.mockResolvedValueOnce({ id: "a2", email: "other@test.local", role: "admin" });
    expect(await impersonateAction("a2", "coach")).toEqual({ ok: false, code: "invalid_request" });
    expect(writeAudit).not.toHaveBeenCalled();
    expect(impersonateUser).not.toHaveBeenCalled();
  });

  it("redirects an athlete impersonation to the athlete zone", async () => {
    findUser.mockResolvedValue({ id: "u3", email: "ath@test.local", role: null });
    impersonateUser.mockResolvedValue({ user: { id: "u3", email: "ath@test.local" } });
    await expect(impersonateAction("u3", "athlete")).rejects.toMatchObject({ to: "/" });
  });

  it("refuses a bad zone without impersonating", async () => {
    expect(await impersonateAction("u2", "admin")).toEqual({ ok: false, code: "invalid_request" });
    expect(impersonateUser).not.toHaveBeenCalled();
  });

  const impersonated = { user: { ...admin, id: "u2", email: "coach@test.local" }, role: null, impersonatedBy: "admin1" };

  it("stops impersonating, audits the stop once for the real admin and returns to the panel", async () => {
    // After the stop, runAction's own audit check sees the admin's session again.
    getSessionContext.mockResolvedValueOnce(impersonated).mockResolvedValue(null);
    stopImpersonating.mockResolvedValue({});
    await expect(stopImpersonatingAction()).rejects.toMatchObject({ to: "/admin" });
    expect(stopImpersonating).toHaveBeenCalled();
    // One read, before stopping: a read afterwards would use the deleted token and clear the restored admin cookie.
    expect(getSessionContext).toHaveBeenCalledTimes(1);
    expect(getSessionContext.mock.invocationCallOrder[0]).toBeLessThan(stopImpersonating.mock.invocationCallOrder[0]);
    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(writeAudit).toHaveBeenCalledWith(prisma, expect.objectContaining({
      actorUserId: "admin1", action: "impersonation.stop", targetUserId: "u2", targetType: "user",
      targetLabel: "coach@test.local",
    }));
  });

  it("still exits when the stop cannot be audited, and logs it", async () => {
    getSessionContext.mockResolvedValueOnce(impersonated).mockResolvedValue(null);
    stopImpersonating.mockResolvedValue({});
    writeAudit.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(stopImpersonatingAction()).rejects.toMatchObject({ to: "/admin" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("refuses to stop when not impersonating", async () => {
    expect(await stopImpersonatingAction()).toEqual({ ok: false, code: "not_found" });
    expect(stopImpersonating).not.toHaveBeenCalled();
  });
});
