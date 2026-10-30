// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, it, expect, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import type { ImportPreview, PreviewItem } from "@/lib/import/translate";
import { allKeys, selectedImport } from "@/lib/import/selection";
import type { ImportRole } from "@/lib/import/schema";
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

function block(title: string, role: ImportRole = "block"): PreviewItem {
  const value: BlockInputValue = {
    kind: "custom", title, color: "neutral", coachingTips: null, videoUrl: null,
    description: "Test work", scoring: "none", timeCapSeconds: null,
  };
  return { role, block: value };
}

function preview(over: Partial<ImportPreview> = {}): ImportPreview {
  return {
    weeksFound: 2,
    daysNamed: true,
    dropped: 0,
    weeks: [
      { label: "Test W1", days: [{ day: 2, items: [block("Test A"), block("Test B")] }, { day: 0, items: [block("Test C")] }] },
      { label: "Test W2", days: [{ day: 0, items: [block("Test D")] }] },
    ],
    ...over,
  };
}

function respond(status: number, body: unknown) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function open(body: unknown, status = 200, filledWeeks: number[] = []) {
  const fetch = respond(status, body);
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ImportDialog ctx={ctx} publishedWeeks={[]} filledWeeks={filledWeeks} onClose={onClose} />
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
        <ImportDialog ctx={ctx} publishedWeeks={[]} filledWeeks={[]} onClose={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("note")).toHaveTextContent(en.import.dataNotice);
    expect(screen.getByRole("dialog", { name: en.import.title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.import.read })).toBeDisabled();
  });

  it("shows the chosen file name and a loading view while the PDF is read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ImportDialog ctx={ctx} publishedWeeks={[]} filledWeeks={[]} onClose={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(en.import.choose)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(en.import.file), { target: { files: [new File(["%PDF-1.4"], "Test week.pdf", { type: "application/pdf" })] } });
    expect(screen.getByText("Test week.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.import.read }));
    expect(await screen.findByRole("status")).toHaveTextContent(en.import.reading);
    expect(screen.queryByLabelText(en.import.file)).not.toBeInTheDocument();
  });

  it("refuses a PDF over 4 MB without calling the server", () => {
    const fetch = respond(200, preview());
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ImportDialog ctx={ctx} publishedWeeks={[]} filledWeeks={[]} onClose={vi.fn()} />
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

    expect(await screen.findByText("4 items selected")).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
    fireEvent.click(confirmButton());
    expect(screen.getByRole("status")).toHaveTextContent(en.import.importing);
    expect(screen.queryByRole("button", { name: en.import.confirm })).not.toBeInTheDocument();
    expect(actions.importBlocksAction).toHaveBeenCalledOnce();
    expect(actions.importBlocksAction).toHaveBeenCalledWith({ programId: "p1", ...selectedImport(allKeys(preview()), new Map(), preview(), ctx), mode: "append" });

    finish({ ok: true, value: undefined });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it("cannot be closed while importing", async () => {
    actions.importBlocksAction.mockReturnValue(new Promise(() => {}));
    const { onClose } = await open(preview());
    await screen.findByText("4 items selected");
    fireEvent.click(confirmButton());
    expect(screen.getByRole("button", { name: en.common.close })).toBeDisabled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables the confirm when every block is unchecked", async () => {
    await open(preview());
    await screen.findByText("4 items selected");
    fireEvent.click(screen.getByRole("checkbox", { name: en.import.selectWeek }));
    expect(screen.getByText("1 item selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.planner.nextWeek }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Test D" }));
    expect(screen.getByText("0 items selected")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it("warns about ignored weeks, unnamed days and unreadable blocks", async () => {
    await open(preview({ weeksFound: 6, daysNamed: false, dropped: 2 }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("The PDF has 6 weeks: only the first 4 are shown and the rest were ignored.")).toBeInTheDocument();
    expect(within(dialog).getByText(en.import.daysUnnamed)).toBeInTheDocument();
    expect(within(dialog).getByText("2 blocks couldn't be read")).toBeInTheDocument();
  });

  it("asks after confirming whether to add to or replace a target week that already has blocks", async () => {
    actions.importBlocksAction.mockResolvedValue({ ok: true, value: undefined });
    await open(preview(), 200, [3, 9]);
    await screen.findByText("4 items selected");
    expect(screen.queryByText(/already has blocks/)).not.toBeInTheDocument();
    fireEvent.click(confirmButton());
    const ask = screen.getByRole("dialog", { name: en.import.clashTitle });
    expect(within(ask).getByText("Week 4 already has blocks. What should happen to them?")).toBeInTheDocument();
    expect(within(ask).getByText(/Replacing deletes the current blocks of that week, its day goals and week notes/)).toBeInTheDocument();
    expect(actions.importBlocksAction).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole("button", { name: en.import.modeReplace }));
    await waitFor(() => expect(actions.importBlocksAction).toHaveBeenCalledWith(expect.objectContaining({ mode: "replace" })));
  });

  it("does not ask when the selection leaves the filled week out", async () => {
    actions.importBlocksAction.mockResolvedValue({ ok: true, value: undefined });
    await open(preview(), 200, [3]);
    await screen.findByText("4 items selected");
    fireEvent.click(screen.getByRole("button", { name: en.planner.nextWeek }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Test D" }));
    fireEvent.click(confirmButton());
    expect(screen.queryByRole("dialog", { name: en.import.clashTitle })).not.toBeInTheDocument();
    await waitFor(() => expect(actions.importBlocksAction).toHaveBeenCalledWith(expect.objectContaining({ mode: "append" })));
  });

  const notesPreview = () => preview({
    weeksFound: 1,
    weeks: [{ label: "Test W1", days: [{ day: 1, items: [block("Test goal", "day_note"), block("Test A")] }] }],
  });
  const roleOf = (heading: string) => screen.getByRole("combobox", { name: `Import “${heading}” as` });

  it("presets each tile's role and imports a note changed to a block as a block", async () => {
    actions.importBlocksAction.mockResolvedValue({ ok: true, value: undefined });
    await open(notesPreview());
    await screen.findByText("2 items selected");
    expect(roleOf("Test goal")).toHaveDisplayValue(en.import.roleDayNote);
    expect(roleOf("Test A")).toHaveDisplayValue(en.import.roleBlock);
    fireEvent.change(roleOf("Test goal"), { target: { value: "block" } });
    fireEvent.click(confirmButton());
    await waitFor(() => expect(actions.importBlocksAction).toHaveBeenCalledOnce());
    const sent = actions.importBlocksAction.mock.calls[0][0];
    expect(sent.items.map((i: { dayIndex: number; block: BlockInputValue }) => [i.dayIndex, i.block.title])).toEqual([[15, "Test goal"], [15, "Test A"]]);
    expect(sent.notes).toEqual([]);
  });

  it("imports a selection that only holds notes", async () => {
    actions.importBlocksAction.mockResolvedValue({ ok: true, value: undefined });
    await open(notesPreview());
    await screen.findByText("2 items selected");
    fireEvent.click(screen.getByRole("checkbox", { name: "Test A" }));
    expect(screen.getByText("1 item selected")).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(actions.importBlocksAction).toHaveBeenCalledWith({
      programId: "p1", items: [], notes: [{ scope: "day", index: 15, text: "Test goal\nTest work" }], mode: "append",
    }));
  });

  it("does not ask about a filled week that only receives notes", async () => {
    actions.importBlocksAction.mockResolvedValue({ ok: true, value: undefined });
    await open(notesPreview(), 200, [2]);
    await screen.findByText("2 items selected");
    fireEvent.click(screen.getByRole("checkbox", { name: "Test A" }));
    fireEvent.click(confirmButton());
    expect(screen.queryByRole("dialog", { name: en.import.clashTitle })).not.toBeInTheDocument();
    await waitFor(() => expect(actions.importBlocksAction).toHaveBeenCalledWith(expect.objectContaining({ mode: "append" })));
  });

  it("names the day whose note would be too long", async () => {
    actions.importBlocksAction.mockResolvedValue({ ok: false, code: "note_too_long", issues: ["day:15"] });
    await open(notesPreview());
    await screen.findByText("2 items selected");
    fireEvent.click(confirmButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("The text for Week 3, Day 2 would exceed 2000 characters.");
  });

  it("shows the server's refusal", async () => {
    await open({ error: "import_empty" }, 422);
    expect(await screen.findByRole("alert")).toHaveTextContent(en.errors.import_empty);
    expect(screen.getByRole("button", { name: en.import.read })).toBeInTheDocument();
  });
});
