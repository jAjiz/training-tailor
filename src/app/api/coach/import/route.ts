import { NextResponse } from "next/server";
import { getProvider, IMPORT_GEMINI_MODEL } from "@/lib/ai";
import type { LlmProvider } from "@/lib/ai/provider";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { ImportEmptyError, translatePdf } from "@/lib/import/translate";
import { consumeQuota, dailyLimit } from "@/lib/quota";
import { prismaQuotaStore } from "@/lib/quota-store";
import { getSessionContext } from "@/lib/session";
import { TrainingError } from "@/lib/training/errors";
import { getCoachByUserId } from "@/lib/training/services/accounts";
import { assertWritable, getOwnedProgram } from "@/lib/training/services/programs";

// A full week PDF takes the import model a few minutes to write out.
export const maxDuration = 300;

const MAX_PDF_BYTES = 4 * 1024 * 1024;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

const hasPdfMagic = (bytes: Uint8Array) => PDF_MAGIC.every((b, i) => bytes[i] === b);

/**
 * Coach-only: the PDF goes to the model and the preview comes back; nothing is written. Cheap checks run
 * first and quota is spent just before the model call. Errors carry a code, never exception text.
 */
export async function POST(req: Request): Promise<Response> {
  const ctx = await getSessionContext();
  if (!ctx) return jsonError("unauthorized", 401);
  if (ctx.impersonatedBy) return jsonError("forbidden", 403);
  const coach = await getCoachByUserId(prisma, ctx.user.id);
  if (!coach) return jsonError("unauthorized", 403);
  if (coach.status !== "approved") return jsonError("coach_pending", 403);

  const form = await req.formData().catch(() => null);
  const programId = form?.get("programId");
  const file = form?.get("pdf");
  if (typeof programId !== "string" || !programId) return jsonError("import_pdf_invalid", 400);

  try {
    assertWritable(await getOwnedProgram(prisma, coach.id, programId));
  } catch (e) {
    if (e instanceof TrainingError && e.code === "not_found") return jsonError("not_found", 404);
    if (e instanceof TrainingError && e.code === "program_archived") return jsonError("program_archived", 409);
    console.error("import program check failed", e);
    return jsonError("internal", 500);
  }

  if (!(file instanceof File)) return jsonError("import_pdf_invalid", 400);
  if (file.size > MAX_PDF_BYTES) return jsonError("import_pdf_too_large", 413);
  const pdf = new Uint8Array(await file.arrayBuffer());
  if (pdf.length === 0 || !hasPdfMagic(pdf)) return jsonError("import_pdf_invalid", 400);

  let provider: LlmProvider;
  try {
    provider = getProvider(process.env.GEMINI_IMPORT_MODEL || IMPORT_GEMINI_MODEL);
  } catch (e) {
    console.error("import unavailable", e);
    return jsonError("import_unavailable", 503);
  }
  const quota = await consumeQuota(prismaQuotaStore, ctx.user.id, "import", dailyLimit());
  if (!quota.allowed) return jsonError("import_quota", 429);

  try {
    return NextResponse.json(await translatePdf(provider, pdf));
  } catch (e) {
    if (e instanceof ImportEmptyError) return jsonError("import_empty", 422);
    console.error("import failed", e);
    return jsonError("import_failed", 502);
  }
}
