import { describe, it, expect } from "vitest";
import { initials } from "@/lib/format";

describe("initials", () => {
  it("takes the first letters of the first and last words", () => {
    expect(initials("Juan Ajiz")).toBe("JA");
    expect(initials("  maría  de la  Sierra ")).toBe("MS");
  });

  it("uses one letter for one word and ? for a blank name", () => {
    expect(initials("madonna")).toBe("M");
    expect(initials("   ")).toBe("?");
  });
});
