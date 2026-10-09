// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, it, expect, vi } from "vitest";
import { Calendar } from "@/components/ui/Calendar";
import { DatePicker } from "@/components/ui/DatePicker";
import { isMonday } from "@/lib/training/dates";

const messages = { calendar: { prevMonth: "Previous month", nextMonth: "Next month", pickDate: "Pick a date" } };
const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
const day = (label: RegExp) => screen.getByRole("button", { name: label });

describe("Calendar", () => {
  it("shows the value's month Monday-first and picks a day", () => {
    const onSelect = vi.fn();
    wrap(<Calendar value="2026-10-14" onSelect={onSelect} />);
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")[0]).toHaveAccessibleName("Monday");
    fireEvent.click(day(/October 22, 2026/));
    expect(onSelect).toHaveBeenCalledWith("2026-10-22");
  });

  it("refuses days before min or outside the rule, and the month before min", () => {
    const onSelect = vi.fn();
    wrap(<Calendar value="2026-10-12" min="2026-10-12" allow={isMonday} onSelect={onSelect} />);
    fireEvent.click(day(/October 5, 2026/));
    fireEvent.click(day(/October 13, 2026/));
    expect(onSelect).not.toHaveBeenCalled();
    expect(day(/October 5, 2026/)).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    fireEvent.click(day(/October 19, 2026/));
    expect(onSelect).toHaveBeenCalledWith("2026-10-19");
  });

  it("moves one tab stop with the arrow keys, across months", () => {
    wrap(<Calendar value="2026-10-31" onSelect={() => {}} autoFocus />);
    expect(day(/October 31, 2026/)).toHaveFocus();
    fireEvent.keyDown(day(/October 31, 2026/), { key: "ArrowRight" });
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    expect(day(/November 1, 2026/)).toHaveFocus();
    expect(day(/November 1, 2026/)).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(day(/November 1, 2026/), { key: "PageUp" });
    expect(day(/October 1, 2026/)).toHaveFocus();
  });

  it("clamps Page Down to the shorter month's last day", () => {
    wrap(<Calendar value="2027-01-31" onSelect={() => {}} autoFocus />);
    fireEvent.keyDown(day(/January 31, 2027/), { key: "PageDown" });
    expect(day(/February 28, 2027/)).toHaveFocus();
  });

  it("selects the value's whole week in week mode", () => {
    wrap(<Calendar select="week" value="2026-10-12" onSelect={() => {}} />);
    const row = day(/October 14, 2026/).closest("[role=row]")!;
    expect(row.querySelectorAll("[aria-selected=true]")).toHaveLength(7);
  });
});

describe("DatePicker", () => {
  it("opens the calendar, picks a date and closes", () => {
    const onChange = vi.fn();
    wrap(<DatePicker value="2026-10-12" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /Oct/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Pick a date" })).toBeInTheDocument();
    fireEvent.click(day(/October 20, 2026/));
    expect(onChange).toHaveBeenCalledWith("2026-10-20");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on Esc and on an outside press", () => {
    wrap(<><DatePicker value="2026-10-12" onChange={() => {}} /><p>outside</p></>);
    const trigger = screen.getByRole("button", { name: /Oct/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByText("outside"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
