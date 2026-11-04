// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, it, expect, vi } from "vitest";
import en from "@/i18n/messages/en.json";

const pathname = vi.hoisted(() => ({ current: "/coach" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("next/link", () => ({
  default: ({ href, ...rest }: { href: string } & Record<string, unknown>) => <a href={href} {...rest} />,
}));

import { CoachNav } from "@/app/coach/CoachNav";
import { CoachNavLinks } from "@/app/coach/CoachNavLinks";

function renderAt(path: string) {
  pathname.current = path;
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CoachNavLinks />
    </NextIntlClientProvider>,
  );
}

const current = (container: HTMLElement) => [...container.querySelectorAll('[aria-current="page"]')].map((el) => el.textContent);
const sections = () => screen.queryByRole("navigation", { name: en.programs.sectionsNav });

describe("CoachNav", () => {
  it("keeps the first row's spacing on phones, whether or not the tabs wrap below it", () => {
    const { container } = render(<CoachNav user={null} approved={false} impersonating={false} />);
    expect(container.querySelector("header > div")).toHaveClass("max-md:py-3.5");
  });
});

describe("CoachNavLinks", () => {
  it("highlights Programs on the coach home, with no tabs", () => {
    const { container } = renderAt("/coach");
    expect(current(container)).toEqual([en.nav.programs]);
    expect(sections()).toBeNull();
  });

  it("highlights Programs on the new program page, with no tabs", () => {
    const { container } = renderAt("/coach/programs/new");
    expect(current(container)).toEqual([en.nav.programs]);
    expect(sections()).toBeNull();
  });

  it("shows no tabs on a block's results page", () => {
    renderAt("/coach/blocks/x/results");
    expect(sections()).toBeNull();
  });

  it("shows the four tabs inside a program and highlights only the planner", () => {
    const { container } = renderAt("/coach/programs/abc");
    expect(current(container)).toEqual([en.programs.planner]);
    const hrefs = within(sections() as HTMLElement).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/coach/programs/abc", "/coach/programs/abc/athletes", "/coach/programs/abc/board", "/coach/programs/abc/settings"]);
    expect(sections()).toHaveClass("max-md:-mb-5");
  });

  it("keeps the roster tab current on an athlete's page", () => {
    const { container } = renderAt("/coach/programs/abc/athletes/x");
    expect(current(container)).toEqual([en.programs.roster]);
  });

  it("highlights only the board tab on the board", () => {
    const { container } = renderAt("/coach/programs/abc/board");
    expect(current(container)).toEqual([en.programs.board]);
  });
});
