import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { AthleteProfileSchema } from "@/lib/engine/types";
import { jsonError } from "@/lib/http";
import { toJson } from "@/lib/json";
import { sanitizeProfile } from "@/lib/profile";
import { getUserId } from "@/lib/session";
import { loadProfile } from "@/lib/tailor-service";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return jsonError("unauthorized", 401);
  return NextResponse.json({ profile: await loadProfile(userId) });
}

export async function PUT(req: Request) {
  const userId = await getUserId();
  if (!userId) return jsonError("unauthorized", 401);
  const parsed = AthleteProfileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("invalid_request", 400);
  const profile = sanitizeProfile(parsed.data, await getDomainData());
  await prisma.athleteProfile.upsert({
    where: { userId },
    create: { userId, data: toJson(profile) },
    update: { data: toJson(profile) },
  });
  return NextResponse.json({ profile });
}
