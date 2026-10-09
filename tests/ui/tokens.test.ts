import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { blockColor } from "@/components/training/colors";
import { BLOCK_COLORS } from "@/lib/training/schemas";

const css = readFileSync("src/app/globals.css", "utf8");
const darkAt = css.indexOf("@media (prefers-color-scheme: dark)");
const light = css.slice(0, darkAt);
const dark = css.slice(darkAt);
const BASE = ["background", "surface", "surface-2", "raised", "border", "foreground", "muted", "primary", "on-primary", "danger", "success"];

describe("theme tokens", () => {
  it("has a dark theme block at the end of the file", () => {
    expect(darkAt).toBeGreaterThan(0);
  });

  it("defines every base token in both themes", () => {
    for (const name of BASE) {
      expect(light, name).toContain(`--${name}:`);
      expect(dark, name).toContain(`--${name}:`);
    }
  });

  it("defines stripe, fill and ink for every block color in both themes", () => {
    for (const c of BLOCK_COLORS) {
      for (const k of ["stripe", "fill", "ink"]) {
        expect(light, `${c}-${k}`).toContain(`--color-block-${c}-${k}:`);
        expect(dark, `${c}-${k}`).toContain(`--color-block-${c}-${k}:`);
      }
    }
  });

  it("maps every block color from data-color", () => {
    for (const c of BLOCK_COLORS) {
      if (c !== "neutral") expect(css, c).toContain(`[data-color="${c}"]`);
    }
  });
});

describe("blockColor", () => {
  it("keeps known colors and falls back to neutral", () => {
    expect(blockColor("blue")).toBe("blue");
    expect(blockColor("magenta")).toBe("neutral");
  });
});
