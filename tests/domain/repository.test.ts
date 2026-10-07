import { describe, it, expect } from "vitest";
import { getDomainData } from "@/lib/domain/repository";

describe("getDomainData", () => {
  it("loads and validates every domain file", async () => {
    const d = await getDomainData();
    expect(d.movements.find((m) => m.name === "Back Squat")?.stresses[0].load).toBe("high");
    expect(d.contraindications.some((c) => c.key === "pregnancy")).toBe(true);
    expect(d.taxonomy.energySystems.map((e) => e.key)).toEqual(["phosphagen", "glycolytic", "oxidative"]);
    expect(d.conversions.effort.length).toBeGreaterThan(0);
  });
});
