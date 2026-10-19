"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, useConfirm } from "@/components/ui/ConfirmDialog";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";
import {
  adminRegenerateInviteAction, changeCoachStatusAction, deleteAthleteAction, deleteCoachAction, impersonateAction,
  previewAthleteDeletionAction, previewCoachDeletionAction, setAthleteDisabledAction, setInviteDisabledAction,
} from "./actions";

/** Runs an admin action: one at a time, its refusal shown as a translated message, the page refreshed on success. */
function useAdminAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ErrorCode | null>(null);
  function run<T>(action: () => Promise<ActionResult<T>>, onOk?: (value: T) => void) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) { setError(r.code); return; }
      if (onOk) onOk(r.value); else router.refresh();
    });
  }
  return { pending, error, setError, run };
}

function ErrorLine({ code }: { code: ErrorCode | null }) {
  const t = useTranslations("errors");
  return code && <p role="alert" className="w-full text-sm text-danger">{t(code)}</p>;
}

/** Counts shown in a delete dialog. */
function Counts({ items }: { items: { label: string; value: number }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-4">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col">
          <dt className="text-xs text-muted">{i.label}</dt>
          <dd className="text-lg font-bold tabular-nums">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type DeleteRequest = { counts: { label: string; value: number }[] };

/** Delete with typed email: loads what would be lost, then asks. */
function useDeleteDialog(opts: {
  title: string; message: string; confirmLabel: string; email: string;
  preview: () => Promise<ActionResult<{ label: string; value: number }[]>>;
  remove: (typedEmail: string) => Promise<ActionResult<unknown>>;
  onDeleted: () => void;
}) {
  const t = useTranslations("admin.common");
  const { pending, error, setError, run } = useAdminAction();
  const [request, setRequest] = useState<DeleteRequest | null>(null);
  const open = () => run(opts.preview, (counts) => setRequest({ counts }));
  const dialog = request && (
    <ConfirmDialog title={opts.title} message={opts.message} confirmLabel={opts.confirmLabel} busy={pending}
      details={<><Counts items={request.counts} /><ErrorLine code={error} /></>}
      typed={{ expected: opts.email, label: t("typeEmail", { email: opts.email }) }}
      onAnswer={(yes, typed) => {
        if (!yes) { setRequest(null); setError(null); return; }
        run(() => opts.remove(typed ?? ""), () => { setRequest(null); opts.onDeleted(); });
      }} />
  );
  return { open, dialog, pending, error: request ? null : error };
}

function EnterButton({ label, userId, zone }: { label: string; userId: string; zone: "coach" | "athlete" }) {
  const { pending, error, run } = useAdminAction();
  return (
    <>
      <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => run(() => impersonateAction(userId, zone))}>{label}</Button>
      <ErrorLine code={error} />
    </>
  );
}

type Coach = { id: string; userId: string; name: string; email: string; status: string };

export function CoachActions({ coach }: { coach: Coach }) {
  const t = useTranslations("admin.coach");
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { pending, error, run } = useAdminAction();
  const remove = useDeleteDialog({
    title: t("deleteTitle", { name: coach.name }), message: t("deleteConfirm"), confirmLabel: t("delete"), email: coach.email,
    preview: async () => {
      const r = await previewCoachDeletionAction(coach.id);
      return r.ok ? { ok: true, value: [
        { label: t("kept"), value: r.value.programsKept }, { label: t("deleted"), value: r.value.programsDeleted },
        { label: t("enrolled"), value: r.value.athletesEnrolled }, { label: t("resultsDeleted"), value: r.value.resultsDeleted },
      ] } : r;
    },
    remove: (email) => deleteCoachAction(coach.id, email),
    onDeleted: () => { router.push("/admin/coaches"); router.refresh(); },
  });

  async function change(to: "approve" | "reject" | "suspend" | "enable") {
    if (to === "reject" && !(await confirm({ title: t("rejectTitle", { name: coach.name }), message: t("rejectConfirm"), confirmLabel: t("reject") }))) return;
    if (to === "suspend" && !(await confirm({ title: t("suspendTitle", { name: coach.name }), message: t("suspendConfirm"), confirmLabel: t("suspend") }))) return;
    run(() => changeCoachStatusAction(coach.id, to));
  }

  const busy = pending || remove.pending;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(coach.status === "pending" || coach.status === "rejected") &&
        <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => change("approve")}>{t("approve")}</Button>}
      {coach.status === "pending" && <Button type="button" variant="danger" size="sm" disabled={busy} onClick={() => change("reject")}>{t("reject")}</Button>}
      {coach.status === "approved" && <Button type="button" variant="danger" size="sm" disabled={busy} onClick={() => change("suspend")}>{t("suspend")}</Button>}
      {coach.status === "suspended" && <Button type="button" size="sm" disabled={busy} onClick={() => change("enable")}>{t("enable")}</Button>}
      <EnterButton label={t("enter")} userId={coach.userId} zone="coach" />
      <Button type="button" variant="danger" size="sm" disabled={busy} onClick={remove.open}>{t("delete")}</Button>
      <ErrorLine code={error ?? remove.error} />
      {confirmDialog}
      {remove.dialog}
    </div>
  );
}

type Athlete = { id: string; userId: string; name: string; email: string; disabled: boolean };

export function AthleteActions({ athlete }: { athlete: Athlete }) {
  const t = useTranslations("admin.athlete");
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { pending, error, run } = useAdminAction();
  const remove = useDeleteDialog({
    title: t("deleteTitle", { name: athlete.name }), message: t("deleteConfirm"), confirmLabel: t("delete"), email: athlete.email,
    preview: async () => {
      const r = await previewAthleteDeletionAction(athlete.id);
      return r.ok ? { ok: true, value: [
        { label: t("enrollments"), value: r.value.enrollments }, { label: t("resultsDeleted"), value: r.value.results },
        { label: t("prs"), value: r.value.prs },
      ] } : r;
    },
    remove: (email) => deleteAthleteAction(athlete.id, email),
    onDeleted: () => { router.push("/admin/athletes"); router.refresh(); },
  });

  async function toggle() {
    if (!athlete.disabled && !(await confirm({ title: t("disableTitle", { name: athlete.name }), message: t("disableConfirm"), confirmLabel: t("disable") }))) return;
    run(() => setAthleteDisabledAction(athlete.id, !athlete.disabled));
  }

  const busy = pending || remove.pending;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant={athlete.disabled ? "secondary" : "danger"} size="sm" disabled={busy} onClick={toggle}>
        {athlete.disabled ? t("enable") : t("disable")}
      </Button>
      <EnterButton label={t("enter")} userId={athlete.userId} zone="athlete" />
      <Button type="button" variant="danger" size="sm" disabled={busy} onClick={remove.open}>{t("delete")}</Button>
      <ErrorLine code={error ?? remove.error} />
      {confirmDialog}
      {remove.dialog}
    </div>
  );
}

export function ProgramActions({ program }: { program: { id: string; name: string; inviteDisabled: boolean } }) {
  const t = useTranslations("admin.programs");
  const { confirm, dialog } = useConfirm();
  const { pending, error, run } = useAdminAction();

  async function toggleInvite() {
    if (!program.inviteDisabled && !(await confirm({
      title: t("disableInviteTitle", { name: program.name }), message: t("disableInviteConfirm"), confirmLabel: t("disableInvite"),
    }))) return;
    run(() => setInviteDisabledAction(program.id, !program.inviteDisabled));
  }

  async function regenerate() {
    if (!(await confirm({ title: t("regenerateTitle", { name: program.name }), message: t("regenerateConfirm"), confirmLabel: t("regenerate") }))) return;
    run(() => adminRegenerateInviteAction(program.id));
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant={program.inviteDisabled ? "secondary" : "danger"} size="sm" disabled={pending} onClick={toggleInvite}>
        {program.inviteDisabled ? t("enableInvite") : t("disableInvite")}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={regenerate}>{t("regenerate")}</Button>
      <ErrorLine code={error} />
      {dialog}
    </div>
  );
}
