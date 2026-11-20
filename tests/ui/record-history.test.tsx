// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";

const actions = vi.hoisted(() => ({
  addPrAction: vi.fn(async () => ({ ok: true as const, value: undefined })),
  deletePrAction: vi.fn(async () => ({ ok: true as const, value: undefined })),
}));
vi.mock("@/app/(athlete)/pr-actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PrHistory } from "@/app/(athlete)/prs/[movement]/PrHistory";
import type { RecordEntry } from "@/lib/training/records";

const show = (entry: RecordEntry, bests: { label: string; value: string }[] = []) => render(
  <NextIntlClientProvider locale="en" messages={en}>
    <PrHistory movement="Test Move" today="2026-10-10" entry={entry} bests={bests}
      entries={[{ id: "r1", label: "Oct 1, 2026", value: "Test value" }]} />
  </NextIntlClientProvider>,
);

beforeEach(() => actions.addPrAction.mockClear());

describe("PrHistory", () => {
  it("offers only the listed rep counts for a lift", () => {
    show({ tab: "lift", kind: "lift", movement: "Test Move" });
    const reps = screen.getByRole("combobox", { name: en.prs.reps });
    expect([...reps.querySelectorAll("option")].map((o) => o.value)).toEqual(["1", "2", "3", "5", "8", "10"]);
  });

  it("offers only the entry's targets, in metres and calories, and sends the chosen one", async () => {
    show({ tab: "cardio", kind: "time", movement: "Test Move", targets: [{ distanceM: 2000 }, { calories: 50 }] });
    const target = screen.getByRole("combobox", { name: en.prs.target });
    expect([...target.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["2 km", "50 cal"]);
    fireEvent.change(target, { target: { value: "1" } });
    fireEvent.change(screen.getByRole("textbox", { name: en.prs.time }), { target: { value: "2:40" } });
    fireEvent.click(screen.getByRole("button", { name: en.prs.add }));
    await waitFor(() => expect(actions.addPrAction).toHaveBeenCalledWith({
      kind: "time", movement: "Test Move", calories: 50, seconds: 160, achievedOn: "2026-10-10",
    }));
  });

  it("offers an added load only on a weighted entry", () => {
    const { unmount } = show({ tab: "gymnastics", kind: "reps", movement: "Test Move", weighted: true });
    expect(screen.getByRole("textbox", { name: en.prs.addedLoad })).toBeInTheDocument();
    unmount();
    show({ tab: "gymnastics", kind: "reps", movement: "Test Move", weighted: false });
    expect(screen.queryByRole("textbox", { name: en.prs.addedLoad })).toBeNull();
  });

  it("sends bodyweight reps with no added load", async () => {
    show({ tab: "gymnastics", kind: "reps", movement: "Test Move", weighted: false });
    fireEvent.change(screen.getByRole("textbox", { name: en.prs.reps }), { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: en.prs.add }));
    await waitFor(() => expect(actions.addPrAction).toHaveBeenCalledWith({
      kind: "reps", movement: "Test Move", reps: 18, kg: null, achievedOn: "2026-10-10",
    }));
  });

  it("adds a distance record in metres and shows the longest", async () => {
    show({ tab: "gymnastics", kind: "distance", movement: "Test Move" }, [{ label: en.prs.bestDistance, value: "25 m" }]);
    expect(screen.getByText("25 m")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: en.prs.distanceRecord }), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: en.prs.add }));
    await waitFor(() => expect(actions.addPrAction).toHaveBeenCalledWith({
      kind: "distance", movement: "Test Move", distanceM: 30, achievedOn: "2026-10-10",
    }));
  });
});
