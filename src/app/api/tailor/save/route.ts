import { NextResponse } from "next/server";
import { MAX_RESULT_BODY_CHARS, SaveBodySchema } from "@/lib/api-schemas";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/http";
import { toJson } from "@/lib/json";
import { getUserId } from "@/lib/session";

// Persists exactly what the athlete reviewed; never re-runs the nondeterministic engine.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return jsonError("unauthorized", 401);
  const raw = await readJsonBody(req, MAX_RESULT_BODY_CHARS);
  if (!raw.ok) return jsonError(raw.code, raw.status);
  const body = SaveBodySchema.safeParse(raw.value);
  if (!body.success) return jsonError("invalid_request", 400);
  const { result, request } = body.data;
  const saved = await prisma.tailoredWorkout.create({
    data: {
      userId,
      original: toJson(result.original),
      request: toJson(request),
      conditions: toJson(result.conditions),
      tailored: toJson(result.tailored),
      findings: toJson(result.findings),
      feedbackHistory: toJson(result.feedbackHistory),
      model: result.model,
    },
  });
  return NextResponse.json({ ok: true, id: saved.id });
}
