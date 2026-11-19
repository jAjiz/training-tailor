// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";

const actions = vi.hoisted(() => ({
  addPrAction: vi.fn(async () => ({ ok: true as const, value: undefined })),
  deletePrAction: vi.fn(async () => ({ ok: true as const, value: undefined })),
}));
vi.mock("@/app/(athlete)/pr-actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PrHistory, type RecordSection } from "@/app/(athlete)/prs/[movement]/PrHistory";
import type { RecordKind } from "@/lib/training/records";

const section = (kind: RecordKind, over: Partial<RecordSection> = {}): RecordSection => ({
  kind, bests: [], entries: [{ id: "r1", label: "Oct 1, 2026", value: "Test value" }], ...over,
});

const show = (formKind: RecordKind | null, sections: RecordSection[]) => render(
  <NextIntlClientProvider locale="en" messages={en}>
    <PrHistory movement="Test Move" today="2026-10-10" formKind={formKind} sections={sections} />
  </NextIntlClientProvider>,
);

describe("PrHistory", () => {
  it("offers only the listed rep counts for a lift", () => {
    show("lift", [section("lift")]);
    const reps = screen.getByRole("combobox", { name: en.prs.reps });
    expect([...reps.querySelectorAll("option")].map((o) => o.value)).toEqual(["1", "2", "3", "5", "8", "10"]);
  });

  it("sends a typed time as seconds over the chosen distance", async () => {
    show("time", [section("time")]);
    fireEvent.change(screen.getByRole("combobox", { name: en.prs.distance }), { target: { value: "2000" } });
    fireEvent.change(screen.getByRole("textbox", { name: en.prs.time }), { target: { value: "7:05" } });
    fireEvent.click(screen.getByRole("button", { name: en.prs.add }));
    await waitFor(() => expect(actions.addPrAction).toHaveBeenCalledWith({
      kind: "time", movement: "Test Move", distanceM: 2000, seconds: 425, achievedOn: "2026-10-10",
    }));
  });

  it("sends bodyweight reps with no added load", async () => {
    show("reps", [section("reps")]);
    fireEvent.change(screen.getByRole("textbox", { name: en.prs.reps }), { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: en.prs.add }));
    await waitFor(() => expect(actions.addPrAction).toHaveBeenCalledWith({
      kind: "reps", movement: "Test Move", reps: 18, kg: null, achievedOn: "2026-10-10",
    }));
  });

  it("shows rows of a kind the library no longer gives, with delete and no form", () => {
    show(null, [section("reps", { bests: [{ label: en.prs.bodyweight, value: "30 reps" }] })]);
    expect(screen.queryByRole("button", { name: en.prs.add })).toBeNull();
    expect(screen.getByText("30 reps")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.common.delete })).toBeInTheDocument();
  });
});
