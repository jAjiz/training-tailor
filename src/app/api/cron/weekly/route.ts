import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { webPushSender } from "@/lib/notifications/push";
import { runWeeklyJob } from "@/lib/training/services/reminders";

export const dynamic = "force-dynamic";

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || header === null) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vercel Cron, Sundays 17:00 UTC (vercel.json). */
export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await runWeeklyJob(prisma, new Date(), webPushSender()));
}
