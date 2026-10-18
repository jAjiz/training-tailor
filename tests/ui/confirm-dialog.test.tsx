// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, it, expect } from "vitest";
import { ConfirmDialog, useConfirm } from "@/components/ui/ConfirmDialog";

beforeAll(() => {
  // jsdom does not implement the modal dialog API.
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  }
});

let answer: Promise<boolean> | null = null;

function Harness() {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button type="button" onClick={() => { answer = confirm({ title: "Delete block", message: "Delete this block?", confirmLabel: "Delete" }); }}>
        ask
      </button>
      {dialog}
    </>
  );
}

const setup = () => {
  render(
    <NextIntlClientProvider locale="en" messages={{ common: { cancel: "Cancel", close: "Close" } }}>
      <Harness />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "ask" }));
};

describe("useConfirm", () => {
  it("asks in a labelled dialog with Cancel focused", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Delete block" })).toBeInTheDocument();
    expect(screen.getByText("Delete this block?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("resolves true on confirm and closes", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await act(async () => { expect(await answer).toBe(true); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("resolves false on Cancel and on Esc", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => { expect(await answer).toBe(false); });
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    await act(async () => { expect(await answer).toBe(false); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ConfirmDialog with a typed confirmation", () => {
  let answered: [boolean, string | undefined][] = [];

  const renderTyped = () => {
    answered = [];
    render(
      <NextIntlClientProvider locale="en" messages={{ common: { cancel: "Cancel", close: "Close" } }}>
        <ConfirmDialog title="Delete coach" message="This cannot be undone." confirmLabel="Delete"
          typed={{ expected: "Coach@Test.local", label: "Type the email" }} onAnswer={(yes, text) => answered.push([yes, text])} />
      </NextIntlClientProvider>,
    );
  };

  it("keeps the confirm button disabled until the expected text is typed", () => {
    renderTyped();
    const confirmButton = screen.getByRole("button", { name: "Delete" });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type the email"), { target: { value: "other@test.local" } });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type the email"), { target: { value: " coach@test.local " } });
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);
    expect(answered).toEqual([[true, " coach@test.local "]]);
  });
});
