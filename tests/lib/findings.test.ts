import { describe, it, expect } from "vitest";
import { componentFindings } from "@/lib/findings";
import type { Finding } from "@/lib/engine/types";

const f = (kind: Finding["kind"], blockIndex: number | null, movement: string | null): Finding =>
  ({ kind, severity: "warning", blockIndex, movement, message: `${kind} ${movement}` });

describe("componentFindings", () => {
  it("returns one finding per kind for the component's block and movement", () => {
    // The same movement twice in a block yields two identical findings: the line shows one badge per kind.
    const findings = [f("caution_movement", 0, "Run"), f("caution_movement", 0, "Run"), f("caution_movement", 1, "Run"), f("equipment_unavailable", 0, "Run")];
    expect(componentFindings(findings, 0, "Run").map((x) => x.kind)).toEqual(["caution_movement", "equipment_unavailable"]);
  });

  it("ignores session-level findings", () => {
    expect(componentFindings([f("time_cap_exceeded", null, null)], 0, "Run")).toEqual([]);
  });
});
