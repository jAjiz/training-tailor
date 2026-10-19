import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
const getSessionContext = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { adminAuditLog: { create: (...a: unknown[]) => create(...a) } } }));
vi.mock("@/lib/session", () => ({ getSessionContext: () => getSessionContext() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), unstable_rethrow: vi.fn() }));

import { runAction } from "@/lib/actions";
import { TrainingError } from "@/lib/training/errors";

const user = { id: "u1", name: "U", email: "u@test.local", image: null };

beforeEach(() => {
  create.mockReset();
  getSessionContext.mockReset();
});

describe("runAction audit", () => {
  it("writes an audit row after a successful action during an impersonation", async () => {
    getSessionContext.mockResolvedValue({ user, role: null, impersonatedBy: "admin1" });
    const result = await runAction("saveResultAction", async () => 42);
    expect(result).toEqual({ ok: true, value: 42 });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin1", action: "saveResultAction", targetUserId: "u1", targetType: "user",
        targetLabel: "u@test.local", impersonating: true,
      }),
    });
  });

  it("writes nothing for a refused or failed action", async () => {
    getSessionContext.mockResolvedValue({ user, role: null, impersonatedBy: "admin1" });
    const result = await runAction("saveResultAction", async () => { throw new TrainingError("not_found"); });
    expect(result).toEqual({ ok: false, code: "not_found" });
    expect(create).not.toHaveBeenCalled();
  });

  it("writes nothing outside an impersonation", async () => {
    getSessionContext.mockResolvedValue({ user, role: null, impersonatedBy: null });
    await runAction("saveResultAction", async () => 1);
    expect(create).not.toHaveBeenCalled();
  });

  it("reads the session once, before the body, and hands it over", async () => {
    const session = { user, role: null, impersonatedBy: "admin1" };
    getSessionContext.mockResolvedValue(session);
    const fn = vi.fn(async () => 3);
    await runAction("stopImpersonatingAction", fn);
    expect(getSessionContext).toHaveBeenCalledTimes(1);
    expect(getSessionContext.mock.invocationCallOrder[0]).toBeLessThan(fn.mock.invocationCallOrder[0]);
    expect(fn).toHaveBeenCalledWith(session);
  });

  it("keeps the result when the audit write fails", async () => {
    getSessionContext.mockResolvedValue({ user, role: null, impersonatedBy: "admin1" });
    create.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runAction("saveResultAction", async () => 7);
    expect(result).toEqual({ ok: true, value: 7 });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
