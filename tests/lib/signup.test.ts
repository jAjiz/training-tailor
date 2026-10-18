import { describe, expect, it } from "vitest";
import { athleteSignupMode, inviteCodeFromNext } from "@/lib/signup";

describe("signup", () => {
  it("accepts only an exact /join/<valid code>", () => {
    expect(inviteCodeFromNext("/join/abc")).toBe("abc");
    for (const bad of ["/join/abc/x", "/join/x/../y", "//evil", "/join/", "/"]) {
      expect(inviteCodeFromNext(bad)).toBeNull();
    }
  });

  it("defaults to invite_only", () => {
    expect(athleteSignupMode({})).toBe("invite_only");
    expect(athleteSignupMode({ ATHLETE_SIGNUP: "bogus" })).toBe("invite_only");
    expect(athleteSignupMode({ ATHLETE_SIGNUP: "open" })).toBe("open");
  });
});
