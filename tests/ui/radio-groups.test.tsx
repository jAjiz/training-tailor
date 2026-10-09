// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ColorSwatches } from "@/components/ui/ColorSwatches";
import { Segmented } from "@/components/ui/Segmented";

const OPTIONS = [
  { value: "a", label: "A" },
  { value: "b", label: "B", disabled: true },
  { value: "c", label: "C" },
  { value: "d", label: "D" },
];

describe("Segmented", () => {
  it("marks the selected option and makes only it tabbable", () => {
    render(<Segmented label="Kind" options={OPTIONS} value="a" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Kind" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "A" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "A" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "C" })).toHaveAttribute("tabindex", "-1");
  });

  it("selects on click", () => {
    const onChange = vi.fn();
    render(<Segmented label="Kind" options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "C" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("moves with arrow keys, skipping disabled options and wrapping", () => {
    const onChange = vi.fn();
    render(<Segmented label="Kind" options={OPTIONS} value="a" onChange={onChange} />);
    const a = screen.getByRole("radio", { name: "A" });
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("c");
    fireEvent.keyDown(a, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("d");
  });
});

describe("ColorSwatches", () => {
  const props = { colors: ["neutral", "red", "blue"], label: "Color", colorLabel: (c: string) => c.toUpperCase() };

  it("selects a color by click and by arrow key", () => {
    const onChange = vi.fn();
    render(<ColorSwatches {...props} value="neutral" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "NEUTRAL" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "BLUE" }));
    expect(onChange).toHaveBeenLastCalledWith("blue");
    fireEvent.keyDown(screen.getByRole("radio", { name: "NEUTRAL" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("red");
  });
});
