// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";
import type { ClarifyQuestion, Finding, PipelineResult } from "@/lib/engine/types";
import type { EngineEvent } from "@/lib/engine-events";
import { couplet, identityResult } from "../fixtures/workouts";

const actions = vi.hoisted(() => ({ acceptAdaptationAction: vi.fn(), discardAdaptationAction: vi.fn() }));
vi.mock("@/app/(athlete)/adapt-actions", () => actions);
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AdaptPanel } from "@/components/training/AdaptPanel";
import { BlockCard, type CardAdaptation, type CardBlock } from "@/components/training/BlockCard";
import type { AdaptationMessage } from "@/lib/training/adaptation-types";

beforeAll(() => {
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  }
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function result(findings: Finding[] = []): PipelineResult {
  return {
    original: couplet(), conditions: [], restrictions: [], unavailableEquipment: [],
    tailored: {
      ...identityResult(couplet()), rawText: "Test adapted text",
      changes: [{ blockIndex: 0, original: "Test Pull", modified: "Test Row", reason: "Test reason" }],
      safetyNote: "Test safety note",
    },
    findings, feedbackHistory: [], model: "test",
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stream(events: EngineEvent[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
}

/** Answers each request in turn; records the URL and parsed body of every call. */
function mockFetch(...responses: Response[]) {
  const calls: { url: string; body: unknown }[] = [];
  const queue = [...responses];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected fetch ${url}`);
    return next;
  }));
  return calls;
}

function open(initialMessages: AdaptationMessage[] = [], locale: "en" | "es" = "en") {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : es}>
      <AdaptPanel blockId="b1" blockTitle="Test WOD" initialMessages={initialMessages} hasAccepted={false} open onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return { onClose };
}

function send(text: string) {
  fireEvent.change(screen.getByRole("textbox", { name: en.adapt.inputLabel }), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: en.adapt.send }));
}

describe("AdaptPanel", () => {
  it("sends a message, streams, shows proposal with Accept", async () => {
    const calls = mockFetch(
      json({ questions: [] }),
      stream([{ type: "progress", stage: "tailoring" }, { type: "result", result: result() }]),
    );
    actions.acceptAdaptationAction.mockResolvedValue({ ok: true, value: undefined });
    const { onClose } = open();
    expect(screen.getByText(en.adapt.privacy)).toBeInTheDocument();
    send("Test my knee hurts");

    expect(await screen.findByText("Test adapted text")).toBeInTheDocument();
    expect(calls).toEqual([
      { url: "/api/blocks/b1/adapt/analyze", body: { text: "Test my knee hurts" } },
      { url: "/api/blocks/b1/adapt/tailor", body: {} },
    ]);
    expect(screen.getByText("Test my knee hurts")).toBeInTheDocument();
    expect(screen.getByText("Test safety note")).toBeInTheDocument();
    expect(screen.getByText(/Test reason/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: en.adapt.accept }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(actions.acceptAdaptationAction).toHaveBeenCalledWith("b1");
    expect(refresh).toHaveBeenCalled();
  });

  it("renders a site question and posts the chosen answer", async () => {
    const question: ClarifyQuestion = {
      kind: "site", restriction: 0, site: "knee", side: null, evidence: "Test my knee hurts",
      options: [
        { label: "Heavy loading", mechanisms: ["compression"], movements: ["Test Combo"] },
        { label: "Explosive", mechanisms: ["ballistic", "impact"], movements: ["Test Pull"] },
      ],
    };
    const calls = mockFetch(
      json({ questions: [question] }),
      json({ questions: [] }),
      stream([{ type: "result", result: result() }]),
    );
    open();
    send("Test my knee hurts");

    const option = await screen.findByRole("checkbox", { name: /Test Pull/ });
    expect(screen.getByRole("checkbox", { name: /Test Combo/ })).toBeInTheDocument();
    // The free text stays open: it answers the site question in the athlete's own words.
    expect(screen.getByRole("textbox", { name: en.adapt.inputLabel })).toBeInTheDocument();
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("button", { name: en.adapt.continue }));

    expect(await screen.findByText("Test adapted text")).toBeInTheDocument();
    expect(calls[1]).toEqual({
      url: "/api/blocks/b1/adapt/analyze",
      body: { answers: [{ kind: "site", restriction: 0, mechanisms: ["ballistic", "impact"] }] },
    });
    expect(calls[2].url).toBe("/api/blocks/b1/adapt/tailor");
  });

  it("requires the buttons when only replacement questions are open", async () => {
    const question: ClarifyQuestion = {
      kind: "replacement", restriction: 0, blockIndex: 0, componentIndex: 1, movement: "Test Pull", site: "knee",
      options: [{ name: "Test Row", shared: [] }, { name: "Test Ring", shared: ["traction"] }], preselected: "Test Row",
    };
    const calls = mockFetch(json({ questions: [question] }), json({ questions: [] }), stream([{ type: "result", result: result() }]));
    open();
    send("Test my knee hurts");

    expect(await screen.findByRole("radio", { name: /Test Row/ })).toBeChecked();
    expect(screen.queryByRole("textbox", { name: en.adapt.inputLabel })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Test Ring/ }));
    fireEvent.click(screen.getByRole("button", { name: en.adapt.continue }));

    expect(await screen.findByText("Test adapted text")).toBeInTheDocument();
    expect(calls[1].body).toEqual({ answers: [{ kind: "replacement", restriction: 0, blockIndex: 0, componentIndex: 1, replacement: "Test Ring" }] });
  });

  it("shows the unsafe error copy", async () => {
    mockFetch(json({ questions: [] }), stream([{ type: "progress", stage: "validating" }, { type: "error", error: "engine_unsafe" }]));
    open();
    send("Test my knee hurts");
    expect(await screen.findByRole("alert")).toHaveTextContent(en.adapt.errors.engine_unsafe);
    expect(screen.queryByRole("button", { name: en.adapt.accept })).toBeNull();
  });

  it("shows the route's error code, such as the daily limit", async () => {
    mockFetch(json({ error: "quota_exceeded" }, 429));
    open();
    send("Test my knee hurts");
    expect(await screen.findByRole("alert")).toHaveTextContent(en.adapt.errors.quota_exceeded);
  });

  it("shows warnings but still allows Accept", async () => {
    const finding: Finding = { kind: "stimulus_drift", severity: "warning", blockIndex: 0, movement: null, message: "Test drift" };
    mockFetch(json({ questions: [] }), stream([{ type: "result", result: result([finding]) }]));
    open();
    send("Test my knee hurts");
    expect(await screen.findByText(en.adapt.warning)).toBeInTheDocument();
    expect(screen.getByText("Block 1 may feel different from what your coach intended.")).toBeInTheDocument();
    expect(screen.queryByText("Test drift")).toBeNull();
    expect(screen.getByRole("button", { name: en.adapt.accept })).toBeEnabled();
  });

  it("words the warnings in the athlete's language, never the validator's message", () => {
    const at = "2026-11-17T10:00:00.000Z";
    const findings: Finding[] = [
      { kind: "caution_movement", severity: "warning", blockIndex: 0, movement: "Test Pull", message: "Test Pull: use caution (test reason)" },
      { kind: "stimulus_drift", severity: "warning", blockIndex: null, movement: null, message: "Test English drift" },
      { kind: "unrecognized_movement", severity: "warning", blockIndex: 0, movement: null, message: "Test English unknown" },
    ];
    open([
      { role: "athlete", at, text: "Test me duele la rodilla" },
      { role: "proposal", at, tailored: result().tailored, findings },
    ], "es");
    expect(screen.getByText(es.adapt.warning)).toBeInTheDocument();
    expect(screen.getByText("Test Pull: hazlo con cuidado, por lo que nos has contado.")).toBeInTheDocument();
    expect(screen.getByText("La sesión puede sentirse distinta de lo que buscaba tu coach.")).toBeInTheDocument();
    // A finding without the detail its copy needs gets the generic line.
    expect(screen.getByText(es.adapt.findings.other)).toBeInTheDocument();
    for (const f of findings) expect(screen.queryByText(f.message)).toBeNull();
    expect(screen.getByRole("button", { name: es.adapt.accept })).toBeEnabled();
  });

  it("clears the proposal when the coach changed the block", async () => {
    mockFetch(json({ questions: [] }), stream([{ type: "result", result: result() }]));
    actions.acceptAdaptationAction.mockResolvedValue({ ok: false, code: "block_changed" });
    const { onClose } = open();
    send("Test my knee hurts");
    fireEvent.click(await screen.findByRole("button", { name: en.adapt.accept }));
    expect(await screen.findByRole("alert")).toHaveTextContent(en.adapt.errors.block_changed);
    expect(screen.queryByRole("button", { name: en.adapt.accept })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("resumes the questions a stored conversation left open", () => {
    const at = "2026-11-17T10:00:00.000Z";
    const site: ClarifyQuestion = {
      kind: "site", restriction: 0, site: "knee", side: "left", evidence: "Test my knee hurts",
      options: [{ label: "Heavy loading", mechanisms: ["compression"], movements: ["Test Combo"] }],
    };
    const replacement: ClarifyQuestion = {
      kind: "replacement", restriction: 1, blockIndex: 0, componentIndex: 1, movement: "Test Pull", site: "knee",
      options: [{ name: "Test Row", shared: [] }], preselected: "Test Row",
    };
    open([
      { role: "athlete", at, text: "Test my knee hurts" },
      { role: "question", at, question: site },
      { role: "question", at, question: replacement },
      { role: "answer", at, answer: { text: "Test only when loaded" } },
    ]);
    // The typed answer closed the site question: only the replacement is left, and it takes the buttons.
    expect(screen.getByRole("radio", { name: /Test Row/ })).toBeChecked();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("textbox", { name: en.adapt.inputLabel })).toBeNull();
    expect(screen.getByText("Test only when loaded")).toBeInTheDocument();
  });
});

const coachBlock: CardBlock = {
  kind: "custom", title: "Test WOD", color: "blue", description: "Test coach text", scoring: null, timeCapSeconds: null,
  movement: null, sets: null, instructions: null, coachingTips: null, videoUrl: null,
};

function card(adaptation: Partial<CardAdaptation>) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BlockCard block={coachBlock} adaptation={{ blockId: "b1", adaptable: false, accepted: null, stale: false, messages: [], ...adaptation }} />
    </NextIntlClientProvider>,
  );
}

describe("BlockCard adaptation", () => {
  it("shows the accepted adaptation, with the original one tap away", () => {
    card({ accepted: result().tailored });
    expect(screen.getByText(en.adapt.adapted)).toBeInTheDocument();
    expect(screen.getByText("Test adapted text")).toBeInTheDocument();
    expect(screen.queryByText("Test coach text")).toBeNull();
    // Tailoring off: the adaptation stays, the Adapt button does not.
    expect(screen.queryByRole("button", { name: en.adapt.adjust, hidden: true })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: en.adapt.seeOriginal, hidden: true }));
    expect(screen.getByText("Test coach text")).toBeInTheDocument();
    expect(screen.queryByText("Test adapted text")).toBeNull();
    expect(screen.getByRole("button", { name: en.adapt.seeAdapted, hidden: true })).toBeInTheDocument();
  });

  it("shows the coach's block and a notice when the coach changed it after acceptance", () => {
    card({ accepted: result().tailored, stale: true, adaptable: true });
    expect(screen.getByText(en.adapt.stale)).toBeInTheDocument();
    expect(screen.getByText("Test coach text")).toBeInTheDocument();
    expect(screen.queryByText(en.adapt.adapted)).toBeNull();
    expect(screen.queryByText("Test adapted text")).toBeNull();
    expect(screen.getByRole("button", { name: en.adapt.again, hidden: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: en.adapt.seePrevious, hidden: true }));
    expect(screen.getByText("Test adapted text")).toBeInTheDocument();
  });

  it("offers Adapt on an adaptable block and opens the panel", () => {
    card({ adaptable: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: en.adapt.open, hidden: true }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(en.adapt.privacy)).toBeInTheDocument();
  });

  it("labels the button Adjust when an adaptation is in force", () => {
    card({ adaptable: true, accepted: result().tailored });
    expect(screen.getByRole("button", { name: en.adapt.adjust, hidden: true })).toBeInTheDocument();
  });
});
