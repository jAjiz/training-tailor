"use server";

import { isAPIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { TrainingError, type ActionResult } from "@/lib/training/errors";
import { parse } from "@/lib/training/schemas";
import {
  adminRegenerateInvite, changeCoachStatus, deleteAthlete, deleteCoach, previewAthleteDeletion, previewCoachDeletion,
  setAthleteDisabled, setInviteDisabled, type AthleteDeletionPreview, type CoachDeletionPreview,
} from "@/lib/training/services/admin";
import { writeAudit } from "@/lib/training/services/audit";

const Id = z.string().min(1).max(64);
const Transition = z.enum(["approve", "reject", "suspend", "enable"]);
const Zone = z.enum(["coach", "athlete"]);
const Email = z.string().max(320);

const revalidateAdmin = () => revalidatePath("/admin", "layout");

export async function changeCoachStatusAction(coachId: unknown, to: unknown): Promise<ActionResult> {
  return runAction("changeCoachStatusAction", async () => {
    const admin = await requireAdmin();
    await changeCoachStatus(prisma, admin.id, parse(Id, coachId), parse(Transition, to));
    revalidateAdmin();
  });
}

export async function previewCoachDeletionAction(coachId: unknown): Promise<ActionResult<CoachDeletionPreview>> {
  return runAction("previewCoachDeletionAction", async () => {
    await requireAdmin();
    return previewCoachDeletion(prisma, parse(Id, coachId));
  });
}

export async function deleteCoachAction(coachId: unknown, confirmEmail: unknown): Promise<ActionResult<CoachDeletionPreview>> {
  return runAction("deleteCoachAction", async () => {
    const admin = await requireAdmin();
    const preview = await deleteCoach(prisma, admin.id, parse(Id, coachId), parse(Email, confirmEmail));
    revalidateAdmin();
    return preview;
  });
}

export async function setAthleteDisabledAction(athleteId: unknown, disabled: unknown): Promise<ActionResult> {
  return runAction("setAthleteDisabledAction", async () => {
    const admin = await requireAdmin();
    await setAthleteDisabled(prisma, admin.id, parse(Id, athleteId), parse(z.boolean(), disabled));
    revalidateAdmin();
  });
}

export async function previewAthleteDeletionAction(athleteId: unknown): Promise<ActionResult<AthleteDeletionPreview>> {
  return runAction("previewAthleteDeletionAction", async () => {
    await requireAdmin();
    return previewAthleteDeletion(prisma, parse(Id, athleteId));
  });
}

export async function deleteAthleteAction(athleteId: unknown, confirmEmail: unknown): Promise<ActionResult<AthleteDeletionPreview>> {
  return runAction("deleteAthleteAction", async () => {
    const admin = await requireAdmin();
    const preview = await deleteAthlete(prisma, admin.id, parse(Id, athleteId), parse(Email, confirmEmail));
    revalidateAdmin();
    return preview;
  });
}

export async function setInviteDisabledAction(programId: unknown, disabled: unknown): Promise<ActionResult> {
  return runAction("setInviteDisabledAction", async () => {
    const admin = await requireAdmin();
    await setInviteDisabled(prisma, admin.id, parse(Id, programId), parse(z.boolean(), disabled));
    revalidateAdmin();
  });
}

export async function adminRegenerateInviteAction(programId: unknown): Promise<ActionResult> {
  return runAction("adminRegenerateInviteAction", async () => {
    const admin = await requireAdmin();
    await adminRegenerateInvite(prisma, admin.id, parse(Id, programId));
    revalidateAdmin();
  });
}

/**
 * Signs in as the user (the plugin keeps the admin session aside) and opens their zone. Redirects on success.
 * The start is audited first, so an impersonation never begins without its row.
 */
export async function impersonateAction(userId: unknown, zone: unknown): Promise<ActionResult<never>> {
  const result = await runAction("impersonateAction", async () => {
    const admin = await requireAdmin();
    const id = parse(Id, userId);
    const target = parse(Zone, zone);
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, role: true } });
    if (!user) throw new TrainingError("not_found");
    if (user.role === "admin") throw new TrainingError("invalid_request");
    await writeAudit(prisma, {
      actorUserId: admin.id, action: "impersonation.start", targetUserId: user.id, targetType: "user",
      targetId: user.id, targetLabel: user.email, details: { zone: target },
    });
    try {
      await auth.api.impersonateUser({ body: { userId: id }, headers: await headers() });
    } catch (e) {
      // The plugin also refuses unknown users and other admins.
      if (isAPIError(e)) throw new TrainingError(e.statusCode === 404 ? "not_found" : "invalid_request");
      throw e;
    }
    return target === "coach" ? "/coach" : "/";
  });
  if (!result.ok) return result;
  redirect(result.value);
}

/** Back to the admin's own session and the panel. Redirects on success; a failed audit write is logged and does not block the exit. */
export async function stopImpersonatingAction(): Promise<ActionResult<never>> {
  const result = await runAction("stopImpersonatingAction", async () => {
    const ctx = await getSessionContext();
    if (!ctx?.impersonatedBy) throw new TrainingError("not_found");
    await auth.api.stopImpersonating({ headers: await headers() });
    try {
      await writeAudit(prisma, {
        actorUserId: ctx.impersonatedBy, action: "impersonation.stop", targetUserId: ctx.user.id, targetType: "user",
        targetId: ctx.user.id, targetLabel: ctx.user.email,
      });
    } catch (e) {
      console.error("[admin] impersonation.stop audit write failed", e);
    }
  });
  if (!result.ok) return result;
  redirect("/admin");
}
