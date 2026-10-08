import { describe, it, expect } from "vitest";
import es from "@/i18n/messages/es.json";
import en from "@/i18n/messages/en.json";
import { MovementPattern } from "@/lib/domain/types";
import { ERROR_CODES } from "@/lib/training/errors";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}
function values(obj: object): unknown[] {
  return Object.values(obj).flatMap((v) => (v !== null && typeof v === "object" ? values(v) : [v]));
}

describe("messages", () => {
  it("has the same keys in Spanish and English", () => {
    expect(keys(en).sort()).toEqual(keys(es).sort());
  });

  it("has no empty message", () => {
    expect(values(es).every((v) => typeof v === "string" && v.trim() !== "")).toBe(true);
    expect(values(en).every((v) => typeof v === "string" && v.trim() !== "")).toBe(true);
  });

  it("translates every error code", () => {
    const errors = es.errors as Record<string, string>;
    for (const code of ERROR_CODES) expect(errors[code], code).toBeTruthy();
  });

  it("labels every movement pattern", () => {
    const patterns = es.patterns as Record<string, string>;
    for (const p of MovementPattern.options) expect(patterns[p], p).toBeTruthy();
  });
});
