// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, it, expect, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { NoteDialog } from "@/app/coach/programs/[id]/planner/NoteDialog";

beforeAll(() => {
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  }
});
afterEach(() => vi.clearAllMocks());

function open(initial: string | null, onSave: (body: string) => Promise<{ ok: true; value: undefined } | { ok: false; code: "invalid_request" }>) {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <NoteDialog title="Test goal" initial={initial} onSave={onSave} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return { onClose };
}

describe("NoteDialog", () => {
  it("prefills the textarea and limits it to 2000 characters", () => {
    open("Test note", vi.fn());
    const box = screen.getByRole("textbox");
    expect(box).toHaveValue("Test note");
    expect(box).toHaveAttribute("maxlength", "2000");
  });

  it("starts empty without an initial note", () => {
    open(null, vi.fn());
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("saves the typed text and closes on success", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    const { onClose } = open(null, onSave);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Test typed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith("Test typed");
  });

  it("shows the error and stays open when saving fails", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: false, code: "invalid_request" });
    const { onClose } = open("Test note", onSave);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(en.errors.invalid_request);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("disables Save while saving", async () => {
    let finish: (r: { ok: true; value: undefined }) => void = () => {};
    const onSave = vi.fn(() => new Promise<{ ok: true; value: undefined }>((res) => { finish = res; }));
    const { onClose } = open("Test note", onSave);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());
    finish({ ok: true, value: undefined });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
