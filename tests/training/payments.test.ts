import { describe, it, expect } from "vitest";
import { programAccess, validatePrice, formatPrice } from "@/lib/training/payments";
import { TrainingError } from "@/lib/training/errors";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const paidProgram = (kind: string, paidSince: Date | null = null) => ({ kind, priceAmount: 1500, paidSince });
const enrollment = (joinedAt = d("2026-11-10"), accessGrantedAt: Date | null = null) => ({ joinedAt, accessGrantedAt });
const sub = (status: string) => ({ kind: "subscription", status });
const pay = (status: string) => ({ kind: "payment", status });

describe("programAccess", () => {
  it("free program -> free", () => {
    expect(programAccess({ kind: "continuous", priceAmount: null, paidSince: null }, enrollment(), [])).toBe("free");
  });

  it("grant beats everything -> granted", () => {
    expect(programAccess(paidProgram("closed"), enrollment(d("2026-11-10"), d("2026-11-11")), [pay("refunded")])).toBe("granted");
  });

  it.each(["active", "trialing", "past_due"])("continuous: %s -> paid", (status) => {
    expect(programAccess(paidProgram("continuous"), enrollment(), [sub(status)])).toBe("paid");
  });

  it.each(["incomplete", "unpaid", "canceled"])("continuous: %s -> blocked", (status) => {
    expect(programAccess(paidProgram("continuous"), enrollment(), [sub(status)])).toBe("blocked");
  });

  it("closed: paid payment -> paid", () => {
    expect(programAccess(paidProgram("closed"), enrollment(), [pay("paid")])).toBe("paid");
  });

  it.each(["refunded", "dispute_lost"])("closed: %s -> blocked", (status) => {
    expect(programAccess(paidProgram("closed"), enrollment(), [pay(status)])).toBe("blocked");
  });

  it("closed: a refunded one plus a paid one -> paid", () => {
    expect(programAccess(paidProgram("closed"), enrollment(), [pay("refunded"), pay("paid")])).toBe("paid");
  });

  it("a purchase of the other kind never counts", () => {
    expect(programAccess(paidProgram("continuous"), enrollment(), [pay("paid")])).toBe("blocked");
    expect(programAccess(paidProgram("closed"), enrollment(), [sub("active")])).toBe("blocked");
  });

  it("closed joined before paidSince -> free; joined after -> blocked without purchase", () => {
    const program = paidProgram("closed", d("2026-11-15"));
    expect(programAccess(program, enrollment(d("2026-11-10")), [])).toBe("free");
    expect(programAccess(program, enrollment(d("2026-11-20")), [])).toBe("blocked");
  });

  it("continuous joined before paidSince -> blocked (no grandfathering)", () => {
    expect(programAccess(paidProgram("continuous", d("2026-11-15")), enrollment(d("2026-11-10")), [])).toBe("blocked");
  });
});

describe("validatePrice", () => {
  it("rejects 49 and 100001, accepts 50 and 100000", () => {
    for (const bad of [49, 100001]) {
      try {
        validatePrice(bad, "eur");
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(TrainingError);
        expect((e as TrainingError).code).toBe("price_invalid");
      }
    }
    expect(() => validatePrice(50, "eur")).not.toThrow();
    expect(() => validatePrice(100000, "eur")).not.toThrow();
  });
});

describe("formatPrice", () => {
  it("formats a monthly price in the locale", () => {
    const text = formatPrice(1500, "eur", "es", true);
    expect(text).toContain("15,00");
    expect(text).toContain("€");
  });
});
