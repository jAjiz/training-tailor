// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { EngineProgress } from "@/components/training/EngineProgress";
import type { ProgressStage } from "@/lib/engine/pipeline";

afterEach(() => { vi.useRealTimers(); });

const show = (stage: ProgressStage) => render(
  <NextIntlClientProvider locale="en" messages={en}><EngineProgress stage={stage} /></NextIntlClientProvider>,
);
const step = (name: string) => screen.getByText(name).closest("li")!;

describe("EngineProgress", () => {
  it("announces the current stage as a status", () => {
    show("tailoring");
    expect(screen.getByRole("status")).toHaveTextContent(en.adapt.stage.tailoring);
  });

  it("marks the steps before the current one as done and the current one as active", () => {
    show("validating");
    expect(step(en.adapt.steps.read)).toHaveAttribute("data-state", "done");
    expect(step(en.adapt.steps.adapt)).toHaveAttribute("data-state", "done");
    expect(step(en.adapt.steps.check)).toHaveAttribute("aria-current", "step");
  });

  it("keeps the last step active while retrying", () => {
    show("retrying");
    expect(step(en.adapt.steps.check)).toHaveAttribute("aria-current", "step");
  });

  it("counts the seconds and reassures the athlete when the model is slow", () => {
    vi.useFakeTimers();
    show("tailoring");
    expect(screen.getByText(en.adapt.waitHint)).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(screen.getByText("30 s")).toBeInTheDocument();
    expect(screen.getByText(en.adapt.slowHint)).toBeInTheDocument();
  });

  it("keeps counting from the start of the run when the stage changes", () => {
    vi.useFakeTimers();
    const view = show("analyzing");
    act(() => { vi.advanceTimersByTime(5_000); });
    view.rerender(<NextIntlClientProvider locale="en" messages={en}><EngineProgress stage="tailoring" /></NextIntlClientProvider>);
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(screen.getByText("8 s")).toBeInTheDocument();
  });
});
