// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, it, expect } from "vitest";
import en from "@/i18n/messages/en.json";
import { WeekNoteButton } from "@/app/(athlete)/WeekNoteButton";

beforeAll(() => {
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  }
});

describe("WeekNoteButton", () => {
  it("opens the note with its line breaks and closes it again", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <WeekNoteButton note={"Test line one\nTest line two"} title="Week 3" />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    const dialog = screen.getByRole("dialog", { name: "Week 3" });
    expect(dialog).toHaveAttribute("data-placement", "bottom");
    const text = dialog.querySelector("p.whitespace-pre-wrap");
    expect(text?.textContent).toBe("Test line one\nTest line two");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
