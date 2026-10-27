// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, it, expect, vi } from "vitest";
import en from "@/i18n/messages/en.json";

const actions = vi.hoisted(() => ({
  discardLibraryDraftAction: vi.fn(),
  restoreLibraryVersionAction: vi.fn(),
  deleteMovementAction: vi.fn(),
  importLibraryAction: vi.fn(),
  openLibraryDraftAction: vi.fn(),
  publishLibraryAction: vi.fn(),
  renameMovementAction: vi.fn(),
  saveMovementAction: vi.fn(),
  saveContraindicationAction: vi.fn(),
  deleteContraindicationAction: vi.fn(),
  saveDocumentAction: vi.fn(),
}));
vi.mock("@/app/admin/library/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { DiscardButton, RestoreButton } from "@/app/admin/library/LibraryActions";
import { DraftRevision, EntryRow, JsonEntryEditor } from "@/app/admin/library/JsonEntryEditor";

beforeAll(() => {
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  }
});

const wrap = (ui: React.ReactNode) =>
  render(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>);

async function expectRefusalInDialog(open: string, confirm: string, message: string) {
  fireEvent.click(screen.getByRole("button", { name: open }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: confirm }));
  await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(message));
}

describe("library confirm dialogs", () => {
  it("shows a refused discard inside the dialog", async () => {
    actions.discardLibraryDraftAction.mockResolvedValue({ ok: false, code: "library_no_draft" });
    wrap(<DiscardButton />);
    await expectRefusalInDialog(en.admin.library.discard, en.admin.library.discard, en.errors.library_no_draft);
  });

  it("shows a refused restore inside the dialog", async () => {
    actions.restoreLibraryVersionAction.mockResolvedValue({ ok: false, code: "library_draft_exists" });
    wrap(<RestoreButton number={3} />);
    await expectRefusalInDialog(en.admin.library.versions.restore, en.admin.library.versions.restore, en.errors.library_draft_exists);
  });

  it("shows a refused delete inside the dialog", async () => {
    actions.deleteMovementAction.mockResolvedValue({ ok: false, code: "library_conflict" });
    wrap(
      <DraftRevision revision={2}>
        <EntryRow type="movement" id="Test A" title="Test A" detail="" json="{}" />
      </DraftRevision>,
    );
    await expectRefusalInDialog(en.admin.library.editor.delete, en.admin.library.editor.delete, en.errors.library_conflict);
  });

  it("lists the schema issues of a refused entry", async () => {
    actions.saveMovementAction.mockResolvedValue({ ok: false, code: "library_invalid", issues: ["equipment: Invalid input"] });
    wrap(
      <DraftRevision revision={2}>
        <JsonEntryEditor target={{ type: "movement", id: null }} initial="{}" />
      </DraftRevision>,
    );
    fireEvent.click(screen.getByRole("button", { name: en.admin.library.editor.save }));
    expect(await screen.findByText("equipment: Invalid input")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(en.errors.library_invalid);
  });
});
