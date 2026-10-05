import { prisma } from "@/lib/db";
import type { AthleteProfile } from "@/lib/engine/types";
import { normalizeProfile } from "@/lib/profile";

export async function loadProfile(userId: string): Promise<AthleteProfile> {
  const row = await prisma.athleteProfile.findUnique({ where: { userId } });
  return normalizeProfile(row?.data);
}
