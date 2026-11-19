// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";

vi.mock("next/link", () => ({
  default: ({ href, ...rest }: { href: string } & Record<string, unknown>) => <a href={href} {...rest} />,
}));

import { PrList, type RecordTabs } from "@/app/(athlete)/prs/PrList";

const tabs: RecordTabs = {
  lift: [{ label: "Squats", movements: [
    { name: "Test Back Squat", summary: "104.5 kg", estimated: true },
    { name: "Test Front Squat", summary: null, estimated: false },
  ] }],
  reps: [{ label: null, movements: [{ name: "Test Pull-up", summary: "20 reps", estimated: false }] }],
  time: [{ label: null, movements: [{ name: "Test Row", summary: "2 km · 7:05", estimated: false }] }],
};

const show = (initial: "lift" | "reps" | "time" = "lift") => render(
  <NextIntlClientProvider locale="en" messages={en}><PrList tabs={tabs} initialTab={initial} /></NextIntlClientProvider>,
);

describe("PrList", () => {
  it("splits records into three sub-tabs and opens the given one", () => {
    show();
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual([en.prs.tabs.lift, en.prs.tabs.reps, en.prs.tabs.time]);
    expect(screen.getByRole("radio", { name: en.prs.tabs.lift })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("link", { name: /Test Back Squat/ })).toHaveTextContent("104.5 kg");
    expect(screen.getByRole("link", { name: /Test Back Squat/ })).toHaveTextContent(en.prs.estimated);
    expect(screen.queryByText("Test Pull-up")).toBeNull();
  });

  it("shows the best of each gymnastic and cardio movement in its tab", () => {
    show();
    fireEvent.click(screen.getByRole("radio", { name: en.prs.tabs.reps }));
    expect(screen.getByRole("link", { name: /Test Pull-up/ })).toHaveTextContent("20 reps");
    fireEvent.click(screen.getByRole("radio", { name: en.prs.tabs.time }));
    expect(screen.getByRole("link", { name: /Test Row/ })).toHaveTextContent("2 km · 7:05");
  });

  it("searches only the open tab", () => {
    show("reps");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "squat" } });
    expect(screen.getByText(en.prs.noResults)).toBeInTheDocument();
  });
});
