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

  it("titles a barbell block with its movement", () => {
    const { container } = renderCard(<BlockCard block={block({ kind: "barbell", movement: "Test Squat", sets: [] })} />);
    expect(container.querySelector("summary h3")).toHaveTextContent(/^Test Squat$/);
  });
});
