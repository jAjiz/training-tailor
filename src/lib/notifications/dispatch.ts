import { after } from "next/server";
import { prisma } from "@/lib/db";
import { deliver, type NotificationIntent } from "./notify";
import { webPushSender } from "./push";

/** Fire-and-forget after the response: the action never waits for, or fails because of, a notification. */
export function dispatch(intents: NotificationIntent[]): void {
  if (intents.length === 0) return;
  after(() => deliver(prisma, intents, webPushSender()).catch((e) => console.error("notification delivery failed", e)));
}
