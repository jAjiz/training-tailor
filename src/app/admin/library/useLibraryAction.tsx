"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";

/** Runs a library action: one at a time, its refusal shown as a translated message, the page refreshed on success. */
export function useLibraryAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setErrorCode] = useState<ErrorCode | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  function setError(code: ErrorCode | null) {
    setErrorCode(code);
    setIssues([]);
  }
  function run<T>(action: () => Promise<ActionResult<T>>, onOk?: (value: T) => void) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) { setErrorCode(r.code); setIssues(r.issues ?? []); return; }
      onOk?.(r.value);
      router.refresh();
    });
  }
  return { pending, error, issues, setError, run };
}

/** The message of a refusal, with the schema issues behind it; a conflict also says to reload. */
export function ErrorLine({ code, issues = [] }: { code: ErrorCode | null; issues?: string[] }) {
  const t = useTranslations("errors");
  const te = useTranslations("admin.library.editor");
  if (!code) return null;
  return (
    <>
      <p role="alert" className="text-sm text-danger">{t(code)}</p>
      {issues.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-danger">
          {issues.map((issue) => <li key={issue} className="break-words font-mono text-xs">{issue}</li>)}
        </ul>
      )}
      {code === "library_conflict" && <p role="status" className="text-sm">{te("reload")}</p>}
    </>
  );
}
