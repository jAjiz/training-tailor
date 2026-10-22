import { describe, it, expect } from "vitest";
import { config } from "@/proxy";

const matches = (p: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(p));

describe("proxy matcher", () => {
  it("lets the PWA files through without a session", () => {
    for (const p of ["/sw.js", "/manifest.webmanifest", "/icons/icon-192.png", "/apple-icon.png"]) expect(matches(p)).toBe(false);
    for (const p of ["/", "/me", "/coach", "/programs/x/board"]) expect(matches(p)).toBe(true);
  });
});
