// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, it, expect, vi } from "vitest";
import en from "@/i18n/messages/en.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ProgramTitle } from "@/app/(athlete)/ProgramTitle";

const renderWith = (programs: { id: string; name: string }[]) =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ProgramTitle programs={programs} selected="a" page="today" />
    </NextIntlClientProvider>,
  );

describe("ProgramTitle", () => {
  it("is a truncating heading with one program", () => {
    renderWith([{ id: "a", name: "Test Strength" }]);
    const heading = screen.getByRole("heading", { level: 1, name: "Test Strength" });
    expect(heading).toHaveClass("truncate");
    expect(heading).not.toHaveClass("text-center");
  });

  it("is a select with readable options, in stored casing, with several", () => {
    renderWith([{ id: "a", name: "Test Strength" }, { id: "b", name: "Test engine" }]);
    const select = screen.getByRole("combobox");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Test Strength", "Test engine"]);
    expect(select).toHaveClass("type-display", "[&>option]:normal-case", "[&>option]:text-foreground");
  });
});
