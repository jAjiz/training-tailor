"use client";

import { createContext, useContext, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, Textarea } from "@/components/ui/controls";
import type { LibraryDocument } from "@/lib/domain/library";
import type { ActionResult } from "@/lib/training/errors";
import {
  deleteContraindicationAction, deleteMovementAction, renameMovementAction, saveContraindicationAction,
  saveDocumentAction, saveMovementAction,
} from "./actions";
import { ErrorLine, useLibraryAction } from "./useLibraryAction";

export type EntryTarget =
  | { type: "movement"; id: string | null }
  | { type: "contraindication"; id: string | null }
  | { type: "document"; id: LibraryDocument };

type Edited = ActionResult<{ revision: number }>;

function save(target: EntryTarget, revision: number, json: string): Promise<Edited> {
  switch (target.type) {
    case "movement": return saveMovementAction(revision, target.id, json);
    case "contraindication": return saveContraindicationAction(revision, target.id, json);
    case "document": return saveDocumentAction(revision, target.id, json);
  }
}

const RevisionContext = createContext<{ revision: number | null; setRevision: (revision: number) => void }>({
  revision: null, setRevision: () => {},
});

/** The draft revision the editors on a page send: the server's, advanced by each successful edit. */
export function DraftRevision({ revision, children }: { revision: number | null; children: React.ReactNode }) {
  const [state, setState] = useState({ from: revision, current: revision });
  let current = state.current;
  if (state.from !== revision) {
    current = revision;
    setState({ from: revision, current: revision });
  }
  return <RevisionContext value={{ revision: current, setRevision: (r) => setState((s) => ({ ...s, current: r })) }}>{children}</RevisionContext>;
}

/** Runs a draft edit and keeps the revision it returns for the next one. */
function useEdit() {
  const { revision, setRevision } = useContext(RevisionContext);
  const { run, ...rest } = useLibraryAction();
  return {
    ...rest,
    revision,
    run: (action: (revision: number) => Promise<Edited>, onOk?: () => void) => {
      if (revision === null) return;
      run(() => action(revision), (v) => { setRevision(v.revision); onOk?.(); });
    },
  };
}

/** The entry as pretty JSON in a monospace field; Save sends the text and the server validates it. */
export function JsonEntryEditor({ target, initial, onClose }: {
  target: EntryTarget; initial: string; onClose?: () => void;
}) {
  const t = useTranslations("admin.library.editor");
  const { pending, error, issues, run } = useEdit();
  const [text, setText] = useState(initial);
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => {
      e.preventDefault();
      run((revision) => save(target, revision, text), onClose);
    }}>
      <Textarea
        aria-label={t("json")} spellCheck={false} rows={Math.min(24, Math.max(8, text.split("\n").length + 1))}
        className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)}
      />
      <ErrorLine code={error} issues={issues} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>{t("save")}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending || (!onClose && text === initial)}
          onClick={() => (onClose ? onClose() : setText(initial))}>{t("cancel")}</Button>
      </div>
    </form>
  );
}

function RenameForm({ name, onClose }: { name: string; onClose: () => void }) {
  const t = useTranslations("admin.library.editor");
  const { pending, error, run } = useEdit();
  const [to, setTo] = useState(name);
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => {
      e.preventDefault();
      run((revision) => renameMovementAction(revision, name, to), onClose);
    }}>
      <p className="text-sm text-muted">{t("renameHelp")}</p>
      <Input aria-label={t("newName")} value={to} maxLength={200} onChange={(e) => setTo(e.target.value)} />
      <ErrorLine code={error} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending || !to.trim() || to === name}>{t("rename")}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onClose}>{t("cancel")}</Button>
      </div>
    </form>
  );
}

/** One movement or contraindication: its summary, and with a draft open its Edit, Rename and Delete. */
export function EntryRow({ type, id, title, detail, json }: {
  type: "movement" | "contraindication"; id: string; title: string; detail: string; json: string;
}) {
  const t = useTranslations("admin.library.editor");
  const [mode, setMode] = useState<"edit" | "rename" | null>(null);
  const [asking, setAsking] = useState(false);
  const { pending, error, setError, run, revision } = useEdit();
  const close = () => setMode(null);
  return (
    <Card as="li" className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-semibold">{title}</p>
          {detail && <p className="break-words text-sm text-muted">{detail}</p>}
        </div>
        {revision !== null && mode === null && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setMode("edit")}>{t("edit")}</Button>
            {type === "movement" && <Button type="button" variant="secondary" size="sm" onClick={() => setMode("rename")}>{t("rename")}</Button>}
            <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => setAsking(true)}>{t("delete")}</Button>
          </div>
        )}
      </div>
      {revision !== null && mode === "edit" && <JsonEntryEditor target={{ type, id }} initial={json} onClose={close} />}
      {revision !== null && mode === "rename" && <RenameForm name={id} onClose={close} />}
      {!asking && <ErrorLine code={error} />}
      {asking && revision !== null && (
        <ConfirmDialog title={t("deleteTitle", { name: title })} message={t(type === "movement" ? "deleteMovementMessage" : "deleteContraindicationMessage")}
          confirmLabel={t("delete")} busy={pending} details={<ErrorLine code={error} />}
          onAnswer={(yes) => {
            if (!yes) { setAsking(false); setError(null); return; }
            run((revision) => (type === "movement" ? deleteMovementAction(revision, id) : deleteContraindicationAction(revision, id)), () => setAsking(false));
          }} />
      )}
    </Card>
  );
}

/** A button that opens an editor to add an entry. */
export function NewEntry({ type, template }: { type: "movement" | "contraindication"; template: string }) {
  const t = useTranslations("admin.library.editor");
  const [open, setOpen] = useState(false);
  if (!open) {
    return <div><Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>{t(type === "movement" ? "newMovement" : "newContraindication")}</Button></div>;
  }
  return (
    <Card className="p-4">
      <JsonEntryEditor target={{ type, id: null }} initial={template} onClose={() => setOpen(false)} />
    </Card>
  );
}
