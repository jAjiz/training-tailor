// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Menu } from "@/components/ui/Menu";

const setup = () => {
  const duplicate = vi.fn();
  const remove = vi.fn();
  render(<Menu label="Block actions" items={[{ label: "Duplicate", onSelect: duplicate }, { label: "Delete", onSelect: remove, danger: true }]} />);
  return { duplicate, remove, trigger: screen.getByRole("button", { name: "Block actions" }) };
};

describe("Menu", () => {
  it("opens from its trigger and focuses the first item", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toHaveFocus();
  });

  it("moves between items with the arrow keys", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Duplicate" }), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
  });

  it("closes with Esc and gives focus back to the trigger", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Duplicate" }), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on a pointer down outside", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("runs the chosen item and closes", () => {
    const { trigger, remove } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
