import { describe, it, expect } from "vitest";
import { renderComponent, renderManualWorkout } from "@/lib/engine/render-text";
import { component } from "../fixtures/workouts";

describe("render-text", () => {
  it("renders a component with only its present fields", () => {
    expect(renderComponent(component("Thruster", { reps: 21, load: "43/30 kg" }))).toBe("21 Thruster @ 43/30 kg");
    expect(renderComponent(component("Row (Erg)", { calories: 15, notes: "easy pace" }))).toBe("Row (Erg) 15 cal (easy pace)");
  });

  it("renders a manual workout block by block", () => {
    const text = renderManualWorkout({
      name: "Monday",
      blocks: [
        { title: "Strength", format: "strength", scheme: "5x5", timeDomainMinutes: 15, coachingNotes: "Rest 2 min",
          components: [component("Back Squat", { load: "100 kg" })] },
        { title: null, format: "amrap", scheme: "AMRAP 8", timeDomainMinutes: 8, coachingNotes: null,
          components: [component("Burpee", { reps: 10 })] },
      ],
    });
    expect(text).toBe("Monday\n\nStrength\n5x5\nBack Squat @ 100 kg\nRest 2 min\n\nAMRAP 8\n10 Burpee");
  });

  it("never renders an empty block", () => {
    expect(renderManualWorkout({ name: null, blocks: [{ title: null, format: "rest", scheme: null, timeDomainMinutes: null, coachingNotes: null, components: [] }] }))
      .toBe("(rest)");
  });
});
