// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, it, expect, vi } from "vitest";
import en from "@/i18n/messages/en.json";

vi.mock("next/navigation", () => ({ usePathname: () => "/calendar", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, ...rest }: { href: string } & Record<string, unknown>) => <a href={href} {...rest} />,
}));

import { AthleteTabBar } from "@/app/(athlete)/AthleteTabBar";

describe("AthleteTabBar", () => {
  it("marks only the current tab, with a bar at the logo's 12 degree slant", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <AthleteTabBar />
      </NextIntlClientProvider>,
    );
    const bars = container.querySelectorAll(".bg-accent");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveClass("-skew-x-12", "h-1.5");
    expect(screen.getByRole("link", { name: en.nav.calendar })).toContainElement(bars[0] as HTMLElement);
  });
});
