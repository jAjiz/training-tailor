import { describe, it, expect } from "vitest";
import { parseAuditParams, parseListParams } from "@/app/admin/params";

describe("parseListParams", () => {
  it("defaults to the first page, no search and no status", () => {
    expect(parseListParams({})).toEqual({ page: 0, search: undefined, status: undefined });
  });

  it("reads a valid search, status and page", () => {
    expect(parseListParams({ search: "  ana ", status: "pending", page: "2" })).toEqual({ page: 2, search: "ana", status: "pending" });
  });

  it("drops an unknown status, a bad page and an overlong search", () => {
    expect(parseListParams({ status: "banned", page: "-1" })).toEqual({ page: 0, search: undefined, status: undefined });
    expect(parseListParams({ page: "abc" }).page).toBe(0);
    expect(parseListParams({ page: "1.5" }).page).toBe(0);
    expect(parseListParams({ search: "x".repeat(200) }).search).toBeUndefined();
  });

  it("takes the first value of a repeated parameter", () => {
    expect(parseListParams({ status: ["approved", "pending"], page: ["3"] })).toEqual({ page: 3, search: undefined, status: "approved" });
  });
});

describe("parseAuditParams", () => {
  it("reads the user and action filters", () => {
    expect(parseAuditParams({ user: "u1", action: "coach.approve", page: "1" })).toEqual({ user: "u1", action: "coach.approve", page: 1 });
  });

  it("drops malformed filters", () => {
    expect(parseAuditParams({ user: "x".repeat(65), action: "drop table;" })).toEqual({ user: undefined, action: undefined, page: 0 });
  });
});
