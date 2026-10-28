// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, it, expect, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import type { ImportPreview } from "@/lib/import/translate";
import { allKeys, selectedItems } from "@/lib/import/selection";
import type { BlockInputValue } from "@/lib/training/schemas";
import type { PlannerContext } from "@/app/coach/programs/[id]/planner/types";

const actions = vi.hoisted(() => ({ importBlocksAction: vi.fn() }));
vi.mock("@/app/coach/block-actions", () => actions);
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ImportDialog } from "@/app/coach/programs/[id]/planner/ImportDialog";

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

const ctx: PlannerContext = { programId: "p1", lifts: [], readOnly: false, maxWeek: null, weekIndex: 2, startDate: null };

function block(title: string): BlockInputValue {
  return {
    kind: "custom", title, color: "neutral", coachingTips: null, videoUrl: null,
    description: "Test work", scoring: "none", timeCapSeconds: null,
  };
}

function preview(over: Partial<ImportPreview> = {}): ImportPreview {
  return {
    weeksFound: 2,
    daysNamed: true,
    dropped: 0,
    weeks: [
      { label: "Test W1", days: [{ day: 2, blocks: [block("Test A"), block("Test B")] }, { day: 0, blocks: [block("Test C")] }] },
      { label: "Test W2", days: [{ day: 0, blocks: [block("Test D")] }] },
    ],
    ...over,
  };
}

function respond(status: number, body: unknown) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function open(body: unknown, status = 200) {
  const fetch = respond(status, body);
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ImportDialog ctx={ctx} publishedWeeks={[]} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  const pdf = new File(["%PDF-1.4"], "test.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText(en.import.file), { target: { files: [pdf] } });
  fireEvent.click(screen.getByRole("button", { name: en.import.read }));
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  return { fetch, onClose };
}

const confirmButton = () => screen.getByRole("button", { name: en.import.confirm });

describe("ImportDialog", () => {
  it("shows the data notice before a PDF is read", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ImportDialog ctx={ctx} publishedWeeks={[]} onClose={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(en.import.dataNotice)).toBeInTheDocument();
  });

  it("refuses a PDF over 4 MB without calling the server", () => {
    const fetch = respond(200, preview());
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ImportDialog ctx={ctx} publishedWeeks={[]} onClose={vi.fn()} />
      </NextIntlClientProvider>,
    );
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(en.import.file), { target: { files: [big] } });
    fireEvent.click(screen.getByRole("button", { name: en.import.read }));
    expect(screen.getByRole("alert")).toHaveTextContent(en.errors.import_pdf_too_large);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("selects every block, counts them and imports the selection once", async () => {
    let finish: (r: { ok: true; value: undefined }) => void = () => {};
    actions.importBlocksAction.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { fetch, onClose } = await open(preview());
    const form = fetch.mock.calls[0][1].body as FormData;
    expect(form.get("programId")).toBe("p1");

    expect(await screen.findByText("4 blocks selected")).toBeInTheDocument();
    expect(screen.getByText("PDF week 1 → Week 3")).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
    fireEvent.click(confirmButton());
    expect(confirmButton()).toBeDisabled();
    expect(actions.importBlocksAction).toHaveBeenCalledOnce();
    expect(actions.importBlocksAction).toHaveBeenCalledWith({ programId: "p1", items: selectedItems(allKeys(preview()), preview(), ctx) });

    finish({ ok: true, value: undefined });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it("blocks Cancel, the close control and the checkboxes while importing", async () => {
    actions.importBlocksAction.mockReturnValue(new Promise(() => {}));
    const { onClose } = await open(preview());
    await screen.findByText("4 blocks selected");
    fireEvent.click(confirmButton());
    expect(screen.getByRole("button", { name: en.common.cancel })).toBeDisabled();
    expect(screen.getByRole("button", { name: en.common.close })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: en.import.selectWeek })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Test A" })).toBeDisabled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables the confirm when every block is unchecked", async () => {
    await open(preview());
    await screen.findByText("4 blocks selected");
    fireEvent.click(screen.getByRole("checkbox", { name: en.import.selectWeek }));
    expect(screen.getByText("1 block selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.planner.nextWeek }));
    expect(screen.getByText("PDF week 2 → Week 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Test D" }));
    expect(screen.getByText("0 blocks selected")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it("warns about ignored weeks, unnamed days and unreadable blocks", async () => {
    await open(preview({ weeksFound: 6, daysNamed: false, dropped: 2 }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("The PDF has 6 weeks: only the first 4 are shown and the rest were ignored.")).toBeInTheDocument();
    expect(within(dialog).getByText(en.import.daysUnnamed)).toBeInTheDocument();
    expect(within(dialog).getByText("2 blocks couldn't be read")).toBeInTheDocument();
  });

  it("shows the server's refusal", async () => {
    await open({ error: "import_empty" }, 422);
    expect(await screen.findByRole("alert")).toHaveTextContent(en.errors.import_empty);
    expect(screen.getByRole("button", { name: en.import.read })).toBeInTheDocument();
  });
});
