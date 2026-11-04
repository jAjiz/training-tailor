// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, ...rest }: { href: string } & Record<string, unknown>) => <a href={href} {...rest} />,
}));

import { WeekStrip } from "@/app/(athlete)/WeekStrip";
import type { IsoDate } from "@/lib/training/dates";

// A week from Monday 9 March 2026: Wednesday is selected, Tuesday is today.
const SELECTED = "2026-03-11" as IsoDate;
const TODAY = "2026-03-10" as IsoDate;
const WITH_BLOCKS = new Set(["2026-03-11", "2026-03-12"] as IsoDate[]);

function dayLinks() {
  const { container } = render(
    <WeekStrip programId="p1" selected={SELECTED} today={TODAY} withBlocks={WITH_BLOCKS} locale="en" labels={{ prev: "Prev", next: "Next" }} />,
  );
  const link = (day: string) => container.querySelector(`a[href$="date=2026-03-${day}"]`) as HTMLAnchorElement;
  return { link, all: () => [...container.querySelectorAll("ol a")] };
}

describe("WeekStrip", () => {
  it("fills the selected day with the accent and navy labels", () => {
    const { link } = dayLinks();
    const selected = link("11");
    expect(selected).toHaveAttribute("aria-current", "date");
    expect(selected).toHaveClass("slant", "before:bg-accent", "text-on-accent");
  });

  it("lets the selected day's labels inherit their color, so forced colors can reach them", () => {
    const { link } = dayLinks();
    for (const child of link("11").querySelectorAll("span")) {
      expect(child.className).not.toMatch(/text-(on-accent|on-chrome|accent)/);
    }
  });

  it("keeps the other days on a lighter navy", () => {
    const { link } = dayLinks();
    expect(link("09")).toHaveClass("slant", "before:bg-white/10");
    expect(link("09")).not.toHaveClass("before:bg-accent");
  });

  it("marks an unselected today with a cyan number that no other day has", () => {
    const { all } = dayLinks();
    const cyan = all().filter((a) => a.querySelector(".text-accent"));
    expect(cyan.map((a) => a.getAttribute("href"))).toEqual(["/?program=p1&date=2026-03-10"]);
  });

  it("keeps today and days with blocks visible in forced colors", () => {
    const { link } = dayLinks();
    expect(link("12").querySelector(".bg-on-chrome")).toHaveClass("forced-colors:bg-[CanvasText]");
    expect(link("10").querySelector(".text-accent")).toHaveClass("forced-colors:underline");
  });

  it("shows a dot on days with blocks, navy on the selected day", () => {
    const { link } = dayLinks();
    expect(link("12").querySelector(".bg-on-chrome")).not.toBeNull();
    expect(link("11").querySelector(".bg-current")).not.toBeNull();
    expect(link("09").querySelector(".bg-on-chrome, .bg-current")).toBeNull();
  });
});
