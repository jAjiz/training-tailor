import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { BLOCK_COLORS } from "@/lib/training/schemas";

const css = readFileSync("src/app/globals.css", "utf8");
const darkAt = css.indexOf("@media (prefers-color-scheme: dark)");
const THEMES = { light: css.slice(0, darkAt), dark: css.slice(darkAt) };
const AA = 4.5;

function token(theme: keyof typeof THEMES, name: string): string {
  const read = (source: string) => source.match(new RegExp(`--${name}:[ ]*(#[0-9a-f]{6})`))?.[1];
  // Chrome is navy in both themes, so it is defined only in :root.
  const value = read(THEMES[theme]) ?? read(THEMES.light);
  if (!value) throw new Error(`No hex value for --${name} in ${theme}`);
  return value;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(["light", "dark"] as const)("%s theme contrast", (theme) => {
  const check = (text: string, on: string) =>
    expect(ratio(token(theme, text), token(theme, on)), `${text} on ${on}`).toBeGreaterThanOrEqual(AA);

  it("keeps text readable on every page surface", () => {
    for (const text of ["foreground", "muted", "danger", "success", "accent-ink"]) {
      for (const on of ["background", "surface", "surface-2"]) check(text, on);
    }
  });

  it("keeps out-of-month calendar days readable at their reduced opacity", () => {
    const blend = (hex: string, over: string, alpha: number) =>
      "#" + [1, 3, 5].map((i) => {
        const value = parseInt(hex.slice(i, i + 2), 16) * alpha + parseInt(over.slice(i, i + 2), 16) * (1 - alpha);
        return Math.round(value).toString(16).padStart(2, "0");
      }).join("");
    const surface = token(theme, "surface");
    expect(ratio(blend(token(theme, "muted"), surface, 0.9), surface)).toBeGreaterThanOrEqual(AA);
    for (const file of ["src/app/(athlete)/calendar/page.tsx", "src/components/ui/Calendar.tsx"]) {
      expect(readFileSync(file, "utf8"), file).toContain("text-muted/90");
    }
  });

  it("keeps text readable on filled tokens", () => {
    check("on-primary", "primary");
    check("on-accent", "accent");
    check("on-chrome", "chrome");
    check("foreground", "raised");
  });

  it("keeps text readable on every block fill", () => {
    for (const color of BLOCK_COLORS) {
      const fill = `color-block-${color}-fill`;
      for (const text of [`color-block-${color}-ink`, "foreground", "muted"]) check(text, fill);
    }
  });
});
