// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, it, expect, vi } from "vitest";
import { Modal } from "@/components/ui/Modal";

beforeAll(() => {
  // jsdom does not implement the modal dialog API.
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  }
});

const open = (onClose = vi.fn()) =>
  render(<Modal title="Edit block" closeLabel="Close" onClose={onClose} footer={<button type="button">Save</button>}><p>Body</p></Modal>);

describe("Modal", () => {
  it("opens as a labelled dialog in document.body", () => {
    open();
    const dialog = screen.getByRole("dialog", { name: "Edit block" });
    expect(dialog).toHaveAttribute("open");
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("closes with the close button and with Esc (cancel event)", () => {
    const onClose = vi.fn();
    open(onClose);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes on a backdrop click but not on a click inside", () => {
    const onClose = vi.fn();
    open(onClose);
    fireEvent.click(screen.getByText("Body"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("gives focus back to the opener when it unmounts", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = open();
    screen.getByRole("button", { name: "Close" }).focus();
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
