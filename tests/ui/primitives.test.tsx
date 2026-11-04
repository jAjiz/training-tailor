// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, ...rest }: { href: string } & Record<string, unknown>) => <a href={href} {...rest} />,
}));

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { chromeNavClasses, navPillClasses } from "@/components/ui/Pill";
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

describe("Button slant", () => {
  it("paints a slanted primary on a skewed fill, with the utility's focus ring", () => {
    render(<Button variant="primary" slanted>Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveClass("slant", "before:bg-primary");
    expect(button).not.toHaveClass("bg-primary");
    expect(button.className).not.toContain("focus-visible:outline-2");
  });

  it("paints a slanted tinted button in cyan", () => {
    render(<Button variant="tinted" slanted>Log</Button>);
    expect(screen.getByRole("button", { name: "Log" })).toHaveClass("slant", "before:bg-accent-tint", "text-accent-ink");
  });

  it("ignores slanted on variants that are never slanted", () => {
    render(<Button variant="secondary" slanted>Back</Button>);
    const button = screen.getByRole("button", { name: "Back" });
    expect(button).not.toHaveClass("slant");
    expect(button.className).toContain("focus-visible:outline-2");
  });

  it("tints a straight button in cyan too", () => {
    render(<Button variant="tinted">Tips</Button>);
    expect(screen.getByRole("button", { name: "Tips" })).toHaveClass("bg-accent-tint", "text-accent-ink");
  });
});

describe("navigation classes", () => {
  it("uses primary for the active item off chrome", () => {
    expect(navPillClasses(true)).toContain("bg-primary");
    expect(navPillClasses(true)).not.toContain("accent");
  });

  it("uses a slanted accent label for the active item on chrome", () => {
    const active = chromeNavClasses(true);
    for (const piece of ["slant", "before:bg-accent", "text-on-accent", "[--slant-focus:var(--on-chrome)]"]) {
      expect(active, piece).toContain(piece);
    }
  });

  it("keeps an inactive item legible on chrome", () => {
    expect(chromeNavClasses(false)).toContain("text-on-chrome/80");
    expect(chromeNavClasses(false)).not.toContain("before:bg-accent");
  });
});

describe("Card", () => {
  it("draws a tapering stripe in the block color instead of a straight border", () => {
    const { container } = render(<Card stripe />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("before:bg-(--block-stripe)");
    expect(card.className).toContain("clip-path");
    expect(card.className).not.toContain("border-l-4");
  });
});

describe("IconButton tone", () => {
  it("reads on chrome with the chrome tone", () => {
    render(<IconButton label="Open" tone="chrome"><svg /></IconButton>);
    expect(screen.getByRole("button", { name: "Open" })).toHaveClass("text-on-chrome");
  });

  it("stays muted by default", () => {
    render(<IconButton label="Open"><svg /></IconButton>);
    expect(screen.getByRole("button", { name: "Open" })).toHaveClass("text-muted");
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
