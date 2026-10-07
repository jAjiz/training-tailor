import { describe, it, expect } from "vitest";
import { renderComponent } from "@/lib/engine/render-text";
import { component } from "../fixtures/workouts";

describe("render-text", () => {
  it("renders a component with only its present fields", () => {
    expect(renderComponent(component("Thruster", { reps: 21, load: "43/30 kg" }))).toBe("21 Thruster @ 43/30 kg");
    expect(renderComponent(component("Row (Erg)", { calories: 15, notes: "easy pace" }))).toBe("Row (Erg) 15 cal (easy pace)");
  });
});
