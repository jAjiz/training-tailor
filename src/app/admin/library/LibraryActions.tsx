"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, Textarea } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { hasErrors, type LibraryFinding } from "@/lib/domain/validate-library";
import { FindingsList } from "./FindingsList";
import { ErrorLine, useLibraryAction } from "./useLibraryAction";
import {
  discardLibraryDraftAction, importLibraryAction, openLibraryDraftAction, publishLibraryAction, restoreLibraryVersionAction,
} from "./actions";

const MAX_FILE_CHARS = 2_000_000;

export function PublishForm({ revision }: { revision: number }) {
  const t = useTranslations("admin.library");
  const { pending, error, run } = useLibraryAction();
  const [note, setNote] = useState("");
  const [accept, setAccept] = useState(false);
  const [findings, setFindings] = useState<LibraryFinding[]>([]);
  const warningsOnly = findings.length > 0 && !hasErrors(findings);
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => {
      e.preventDefault();
      run(() => publishLibraryAction(revision, note, warningsOnly && accept), (outcome) => {
        setAccept(false);
        setFindings(outcome.ok ? [] : outcome.findings);
        if (outcome.ok) setNote("");
      });
    }}>
      <Field label={t("note")}>
        <Textarea required maxLength={500} rows={3} value={note} placeholder={t("notePlaceholder")} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {findings.length > 0 && (
        <>
          <p role="status" className="text-sm font-medium">{t(warningsOnly ? "warned" : "blocked")}</p>
          <FindingsList findings={findings} />
        </>
      )}
      {warningsOnly && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          {t("acceptWarnings")}
        </label>
      )}
      <ErrorLine code={error} />
      <div>
        <Button type="submit" variant="primary" disabled={pending || !note.trim() || (warningsOnly && !accept)}>
          {t(warningsOnly ? "publishAnyway" : "publish")}
        </Button>
      </div>
    </form>
  );
}

export function OpenDraftButton() {
  const t = useTranslations("admin.library");
  const { pending, error, run } = useLibraryAction();
  return (
    <>
      <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => run(openLibraryDraftAction)}>{t("openDraft")}</Button>
      <ErrorLine code={error} />
    </>
  );
}

export function DiscardButton() {
  const t = useTranslations("admin.library");
  const { pending, error, setError, run } = useLibraryAction();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => setAsking(true)}>{t("discard")}</Button>
      {!asking && <ErrorLine code={error} />}
      {asking && (
        <ConfirmDialog title={t("discardTitle")} message={t("discardMessage")} confirmLabel={t("discard")} busy={pending}
          details={<ErrorLine code={error} />}
          onAnswer={(yes) => {
            if (!yes) { setAsking(false); setError(null); return; }
            run(discardLibraryDraftAction, () => setAsking(false));
          }} />
      )}
    </>
  );
}

export function ImportForm() {
  const t = useTranslations("admin.library");
  const { pending, error, issues, setError, run } = useLibraryAction();
  const input = useRef<HTMLInputElement>(null);
  const [tooLarge, setTooLarge] = useState(false);
  return (
    <form className="flex flex-col gap-3" onSubmit={async (e) => {
      e.preventDefault();
      const file = input.current?.files?.[0];
      if (!file) return;
      setTooLarge(false);
      setError(null);
      const text = await file.text();
      if (text.length > MAX_FILE_CHARS) { setTooLarge(true); return; }
      run(() => importLibraryAction(text), () => { if (input.current) input.current.value = ""; });
    }}>
      <Field label={t("importFile")} hint={t("importHelp")}>
        <Input ref={input} type="file" accept="application/json,.json" required />
      </Field>
      {tooLarge && <p role="alert" className="text-sm text-danger">{t("importTooLarge")}</p>}
      <ErrorLine code={error} issues={issues} />
      <div><Button type="submit" variant="secondary" disabled={pending}>{t("import")}</Button></div>
    </form>
  );
}

export function RestoreButton({ number }: { number: number }) {
  const t = useTranslations("admin.library");
  const { pending, error, setError, run } = useLibraryAction();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setAsking(true)}>{t("versions.restore")}</Button>
      {!asking && <ErrorLine code={error} />}
      {asking && (
        <ConfirmDialog title={t("versions.restoreTitle", { number })} message={t("versions.restoreMessage")}
          confirmLabel={t("versions.restore")} danger={false} busy={pending} details={<ErrorLine code={error} />}
          onAnswer={(yes) => {
            if (!yes) { setAsking(false); setError(null); return; }
            run(() => restoreLibraryVersionAction(number), () => setAsking(false));
          }} />
      )}
    </>
  );
}
