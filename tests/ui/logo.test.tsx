import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { LOGO_BACK_PATH, LOGO_FRONT_PATH, LOGO_VIEWBOX } from "@/components/logo-paths";

const svg = readFileSync("assets/icon.svg", "utf8");
const sw = readFileSync("public/sw.js", "utf8");
// The comment names the source font, so only the markup is checked.
const markup = svg.replace(/<!--[\s\S]*?-->/g, "");

describe("logo artwork", () => {
  it("is two filled paths, back T in cyan and front T in white", () => {
    const paths = [...markup.matchAll(/<path\b[^>]*>/g)].map((m) => m[0]);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toContain('fill="#22d3ee"');
    expect(paths[1]).toContain('fill="#ffffff"');
  });

  it("has real geometry, with nothing that depends on the background or a font", () => {
    for (const banned of ["stroke", "mask", "clip", "<text", "<rect"]) {
      expect(markup).not.toContain(banned);
    }
  });

  it("uses the same paths as the inline logo", () => {
    const ds = [...markup.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
    expect(ds).toEqual([LOGO_BACK_PATH, LOGO_FRONT_PATH]);
    expect(markup).toContain(`viewBox="${LOGO_VIEWBOX}"`);
  });
});

describe("notification icons", () => {
  it("point the badge at the monochrome silhouette and keep the full icon", () => {
    expect(sw).toContain('badge: "/icons/badge-96.png"');
    expect(sw).toContain('icon: "/icons/icon-192.png"');
    expect(existsSync("public/icons/badge-96.png")).toBe(true);
  });
});
