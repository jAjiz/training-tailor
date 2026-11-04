// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { Brand, Logo } from "@/components/Brand";
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

describe("Logo", () => {
  const paths = (root: Element) => [...root.querySelectorAll("path")];

  it("is an inline svg with theme fills and the shared paths", () => {
    const { container } = render(<Logo />);
    expect(container.querySelector("img")).toBeNull();
    const [back, front] = paths(container);
    expect(back).toHaveAttribute("d", LOGO_BACK_PATH);
    expect(front).toHaveAttribute("d", LOGO_FRONT_PATH);
    expect(back).toHaveClass("fill-logo-back");
    expect(front).toHaveClass("fill-logo-front");
  });

  it("forces white and cyan on chrome", () => {
    const { container } = render(<Logo onChrome />);
    const [back, front] = paths(container);
    expect(back).toHaveClass("fill-accent");
    expect(front).toHaveClass("fill-on-chrome");
  });
});

describe("Brand", () => {
  it("shows the wordmark in display style, beside a logo with no background", () => {
    const { container } = render(<Brand />);
    expect(screen.getByText("Training Tailor")).toHaveClass("type-display");
    expect(container.querySelector("img")).toBeNull();
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg.getAttribute("class")).not.toMatch(/rounded|bg-/);
  });

  it("hides only the wordmark on narrow screens when compact", () => {
    render(<Brand compactWordmark />);
    expect(screen.getByText("Training Tailor")).toHaveClass("max-sm:sr-only");
  });

  it("enlarges the logo for sign-in pages", () => {
    const { container } = render(<Brand size="lg" />);
    expect(container.querySelector("svg")).toHaveClass("size-14");
  });
});
