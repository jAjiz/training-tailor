import { describe, it, expect } from "vitest";
import { installPlatform, shouldGate } from "@/lib/notifications/install";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

describe("installPlatform", () => {
  it("detects iOS Safari", () => expect(installPlatform(IPHONE)).toBe("ios-safari"));
  it("detects other iOS browsers", () => {
    for (const token of ["CriOS/124", "FxiOS/124", "EdgiOS/124"]) {
      expect(installPlatform(`${IPHONE} ${token}`)).toBe("ios-other");
    }
  });
  it("detects in-app browsers", () => {
    for (const token of ["Instagram 300", "FBAN/FBIOS", "FBAV/450", "WhatsApp/2.24"]) {
      expect(installPlatform(`${IPHONE} ${token}`)).toBe("in-app");
    }
  });
  it("detects Android", () => expect(installPlatform(ANDROID)).toBe("android"));
  it("falls back to other", () => expect(installPlatform(DESKTOP)).toBe("other"));
});

describe("shouldGate", () => {
  const base = { enabled: true, phone: true, standalone: false, pathname: "/" };
  it("gates a phone in a browser tab", () => {
    for (const pathname of ["/", "/me", "/programs/x/board"]) expect(shouldGate({ ...base, pathname })).toBe(true);
  });
  it("does not gate otherwise", () => {
    expect(shouldGate({ ...base, enabled: false })).toBe(false);
    expect(shouldGate({ ...base, phone: false })).toBe(false);
    expect(shouldGate({ ...base, standalone: true })).toBe(false);
    for (const pathname of ["/signin", "/onboarding", "/join/abc"]) expect(shouldGate({ ...base, pathname })).toBe(false);
  });
});
