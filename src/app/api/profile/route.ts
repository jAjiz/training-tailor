import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { AthleteProfileSchema } from "@/lib/engine/types";
import { engineUserId } from "@/lib/engine-access";
import { jsonError } from "@/lib/http";
import { toJson } from "@/lib/json";
import { sanitizeProfile } from "@/lib/profile";
import { loadProfile } from "@/lib/tailor-service";

export async function GET() {
  const user = await engineUserId();
  if (!user.ok) return user.response;
  return NextResponse.json({ profile: await loadProfile(user.userId) });
}

export async function PUT(req: Request) {
  const user = await engineUserId();
  if (!user.ok) return user.response;
  const { userId } = user;
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
