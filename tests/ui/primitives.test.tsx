// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, ...rest }: { href: string } & Record<string, unknown>) => <a href={href} {...rest} />,
}));

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";

describe("Button", () => {
  it("renders a link with the requested look when href is given", () => {
    render(<Button href="/x" variant="primary">Go</Button>);
    const link = screen.getByRole("link", { name: "Go" });
    expect(link).toHaveAttribute("href", "/x");
    expect(link.className).toContain("bg-primary");
  });

  it("renders a secondary button by default and stretches with block", () => {
    render(<Button type="button" block>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain("bg-surface-2");
    expect(button.className).toContain("w-full");
  });
});

describe("IconButton", () => {
  it("names the control with its label", () => {
    render(<IconButton label="Close"><svg /></IconButton>);
    expect(screen.getByRole("button", { name: "Close" })).toHaveAttribute("type", "button");
  });
});

describe("Field", () => {
  it("labels its control and announces errors", () => {
    render(<Field label="Name" error="Required"><Input /></Field>);
    expect(screen.getByLabelText("Name")).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });
});

describe("Avatar", () => {
  it("shows the image when there is one, initials otherwise", () => {
    const { container, rerender } = render(<Avatar name="Juan Ajiz" image="https://example.com/a.png" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/a.png");
    rerender(<Avatar name="Juan Ajiz" />);
    expect(container).toHaveTextContent("JA");
  });
});
