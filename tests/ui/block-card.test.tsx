// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";
import { BlockCard, type CardBlock } from "@/components/training/BlockCard";

const block = (over: Partial<CardBlock>): CardBlock => ({
  kind: "custom", title: null, color: "blue", description: null, scoring: null, timeCapSeconds: null,
  movement: null, sets: null, instructions: null, coachingTips: null, videoUrl: null, ...over,
});

const renderCard = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>);

describe("BlockCard (athlete)", () => {
  it("starts collapsed to its title and summary, with the body inside", () => {
    const { container } = renderCard(
      <BlockCard block={block({ title: "Test WOD", description: "Test 21-15-9" })} summary="5:30"><button>Test log</button></BlockCard>,
    );
    const details = container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    const summary = details.querySelector("summary")!;
    expect(summary).toHaveTextContent("Test WOD");
    expect(summary).toHaveTextContent("5:30");
    expect(summary).not.toHaveTextContent("Test 21-15-9");
    expect(screen.getByRole("button", { name: "Test log", hidden: true }).closest("summary")).toBeNull();
  });

  it("titles an untitled block with the first line of its text", () => {
    const { container } = renderCard(<BlockCard block={block({ description: "  Test first line\nTest second line" })} />);
    expect(container.querySelector("summary h3")).toHaveTextContent(/^Test first line$/);
  });

  it("keeps the stored casing of a title taken from the block's text", () => {
    const { container } = renderCard(<BlockCard block={block({ description: "Test first line" })} />);
    expect(container.querySelector("summary h3")).toHaveClass("normal-case");
  });

  it("titles a barbell block with its movement", () => {
    const { container } = renderCard(<BlockCard block={block({ kind: "barbell", movement: "Test Squat", sets: [] })} />);
    expect(container.querySelector("summary h3")).toHaveTextContent(/^Test Squat$/);
  });

  it("sets the scoring line as a cyan label", () => {
    renderCard(<BlockCard block={block({ title: "Test WOD", scoring: "for_time" })} />);
    expect(screen.getByText(en.block.scoring.for_time)).toHaveClass("type-label", "text-accent-ink");
  });

  it("draws each barbell set as a slanted chip", () => {
    const sets = [{ reps: 5, percent: null, kg: 100 }];
    const { container } = renderCard(<BlockCard block={block({ kind: "barbell", movement: "Test Squat", sets })} />);
    const items = [...container.querySelectorAll("ul li")];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item).toHaveClass("slant", "before:bg-surface-2");
  });

  it("slants the coaching tips button", () => {
    const { container } = renderCard(<BlockCard block={block({ title: "Test WOD", coachingTips: "Test tip" })} />);
    const tips = screen.getByText(en.block.coachingTips, { selector: "summary" });
    expect(tips).toHaveClass("slant", "before:bg-accent-tint");
    expect(container.querySelector("article")?.className).toContain("clip-path");
  });

  it("never uppercases a block's description", () => {
    renderCard(<BlockCard block={block({ title: "Test WOD", description: "Test lower case" })} />);
    const description = screen.getByText("Test lower case");
    expect(description).not.toHaveClass("uppercase");
    expect(description).not.toHaveClass("type-display");
  });
});

describe("BlockCard (planner)", () => {
  it("has no slanted element, so tiles keep their drag and focus behavior", () => {
    const { container } = renderCard(
      <BlockCard compact block={block({ title: "Test WOD", scoring: "for_time", kind: "barbell", movement: "Test Squat", sets: [{ reps: 5, percent: null, kg: 100 }] })} />,
    );
    expect(container.querySelector(".slant")).toBeNull();
    expect(container.querySelector("article")?.className).not.toContain("clip-path");
  });
});
