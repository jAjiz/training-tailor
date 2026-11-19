// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/(athlete)/pr-actions", () => ({ addPrAction: vi.fn() }));
vi.mock("@/app/(athlete)/result-actions", () => ({ saveResultAction: vi.fn(), deleteResultAction: vi.fn() }));

import { LogForm } from "@/app/(athlete)/blocks/[id]/log/LogForm";

const show = (estimatedOneRm: number | null) => render(
  <NextIntlClientProvider locale="en" messages={en}>
    <LogForm blockId="b1" target={{ kind: "barbell" }} date="2026-10-10" backHref="/"
      initial={{ minutes: "", seconds: "", capped: false, rounds: "", reps: "", value: "", sets: [{ kg: "83.5", reps: "5" }] }}
      initialDivision="rx" initialNotes="" divisionLocked={false} hasResult={false}
      titles={{ new: "Test log", edit: "Test edit" }} subtitle="Test Squat" estimatedOneRm={estimatedOneRm} />
  </NextIntlClientProvider>,
);

describe("LogForm", () => {
  it("says when the prefilled loads come from an estimated 1RM", () => {
    show(104.5);
    expect(screen.getByText(/estimated 1RM/)).toHaveTextContent("104.5");
  });

  it("says nothing when the loads come from a real 1RM", () => {
    show(null);
    expect(screen.queryByText(/estimated 1RM/)).toBeNull();
  });
});
