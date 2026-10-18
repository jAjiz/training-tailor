import { describe, it, expect } from "vitest";
import { isAdminSession } from "@/lib/admin-access";

describe("isAdminSession", () => {
  it("an impersonation session is never admin", () => {
    expect(isAdminSession({ role: "admin", impersonatedBy: "x" })).toBe(false);
  });

  it("needs the admin role", () => {
    expect(isAdminSession({ role: null, impersonatedBy: null })).toBe(false);
    expect(isAdminSession(null)).toBe(false);
    expect(isAdminSession({ role: "admin", impersonatedBy: null })).toBe(true);
  });
});
