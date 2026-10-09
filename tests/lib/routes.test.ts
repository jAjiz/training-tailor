import { describe, it, expect } from "vitest";
import { isPublicPath, safeNext, signinPathFor, withProgram } from "@/lib/routes";

describe("routes", () => {
  it("leaves the sign-in pages and invitations public", () => {
    expect(isPublicPath("/signin")).toBe(true);
    expect(isPublicPath("/coach/signin")).toBe(true);
    expect(isPublicPath("/join/abc123")).toBe(true);
    expect(isPublicPath("/join/abc123/x")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/coach")).toBe(false);
  });

  it("sends each zone to its own sign-in", () => {
    expect(signinPathFor("/coach")).toBe("/coach/signin");
    expect(signinPathFor("/coach/programs/1")).toBe("/coach/signin");
    expect(signinPathFor("/coachella")).toBe("/signin");
    expect(signinPathFor("/me")).toBe("/signin");
  });

  it("only follows local next paths", () => {
    expect(safeNext("/join/abc")).toBe("/join/abc");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext(undefined, "/me")).toBe("/me");
  });

  it("carries the selected program to another athlete page", () => {
    expect(withProgram("/calendar", "p1")).toBe("/calendar?program=p1");
    expect(withProgram("/calendar", null)).toBe("/calendar");
    expect(withProgram("/", "a b")).toBe("/?program=a%20b");
  });
});
