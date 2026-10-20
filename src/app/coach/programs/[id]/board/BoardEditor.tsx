"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnnouncementText } from "@/components/notifications/AnnouncementText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Textarea } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ErrorCode } from "@/lib/training/errors";
import { ANNOUNCEMENT_MAX } from "@/lib/training/schemas";
import { createAnnouncementAction, deleteAnnouncementAction, updateAnnouncementAction } from "../../../board-actions";

export type BoardItem = { id: string; body: string; when: string; edited: boolean };

function Composer({ initial, submitLabel, onSubmit, onCancel }: {
  initial: string; submitLabel: string; onSubmit: (body: string) => Promise<ErrorCode | null>; onCancel?: () => void;
}) {
  const t = useTranslations("board");
  const te = useTranslations("errors");
  const [body, setBody] = useState(initial);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const code = await onSubmit(body);
    setBusy(false);
    setError(code);
    if (!code && !onCancel) setBody("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Textarea aria-label={t("label")} placeholder={t("placeholder")} rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={body.length > ANNOUNCEMENT_MAX ? "text-sm text-danger" : "text-sm text-muted"} aria-live="polite">
          {t("counter", { count: body.length })}
        </span>
        <span className="flex gap-2">
          {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t("cancel")}</Button>}
          <Button type="submit" variant="primary" disabled={busy || body.trim().length === 0 || body.length > ANNOUNCEMENT_MAX}>{submitLabel}</Button>
        </span>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{te(error)}</p>}
    </form>
  );
}

export function BoardEditor({ programId, items, writable }: { programId: string; items: BoardItem[]; writable: boolean }) {
  const t = useTranslations("board");
  const te = useTranslations("errors");
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<ErrorCode | null>(null);

  async function run(r: { ok: true } | { ok: false; code: ErrorCode }): Promise<ErrorCode | null> {
    if (r.ok) { router.refresh(); return null; }
    return r.code;
  }

  async function remove(id: string) {
    if (!(await confirm({ title: t("deleteTitle"), message: t("deleteConfirm"), confirmLabel: t("delete") }))) return;
    setDeleteError(await run(await deleteAnnouncementAction(id)));
  }

  return (
    <div className="flex flex-col gap-4">
      {writable ? (
        <Card className="p-5">
          <Composer initial="" submitLabel={t("publish")} onSubmit={async (body) => run(await createAnnouncementAction(programId, body))} />
        </Card>
      ) : (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">{t("readOnly")}</p>
      )}
      {deleteError && <p role="alert" className="text-sm text-danger">{te(deleteError)}</p>}
      {items.length === 0 ? <EmptyState>{t("empty")}</EmptyState> : (
        <ul className="flex flex-col gap-3">
          {items.map((a) => (
            <li key={a.id}>
              <Card className="flex flex-col gap-3 p-5">
                <p className="text-xs text-muted">{a.when}{a.edited && ` · ${t("edited")}`}</p>
                {editing === a.id ? (
                  <Composer initial={a.body} submitLabel={t("save")} onCancel={() => setEditing(null)}
                    onSubmit={async (body) => {
                      const code = await run(await updateAnnouncementAction(a.id, body));
                      if (!code) setEditing(null);
                      return code;
                    }} />
                ) : (
                  <>
                    <AnnouncementText body={a.body} />
                    {writable && (
                      <span className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(a.id)}>{t("edit")}</Button>
                        <Button type="button" variant="danger" size="sm" onClick={() => remove(a.id)}>{t("delete")}</Button>
                      </span>
                    )}
                  </>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </div>
  );
}
