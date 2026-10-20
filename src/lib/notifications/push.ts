import webpush from "web-push";

export type PushPayload = { title: string; body: string; url: string; tag: string };
export type PushTarget = { endpoint: string; p256dh: string; auth: string };
/** "gone" = the push service answered 404/410: the subscription is dead. */
export type PushOutcome = "ok" | "gone" | "failed";
export interface PushSender { send(target: PushTarget, payload: PushPayload): Promise<PushOutcome> }

const TTL_SECONDS = 24 * 60 * 60;
/** A hung endpoint must not stall the sequential sends inside `after()`. */
const SEND_TIMEOUT_MS = 10_000;

/** A web-push sender, or null when the three VAPID settings are not all present (inbox only). */
export function webPushSender(env: NodeJS.ProcessEnv = process.env): PushSender | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  const vapidDetails = { subject, publicKey, privateKey };
  return {
    async send(target, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(payload),
          { TTL: TTL_SECONDS, timeout: SEND_TIMEOUT_MS, vapidDetails },
        );
        return "ok";
      } catch (e) {
        const { statusCode, message } = (e ?? {}) as { statusCode?: number; message?: string };
        if (statusCode === 404 || statusCode === 410) return "gone";
        // Status and message only: no endpoint or keys.
        console.error("[push] web-push failed", statusCode, message);
        return "failed";
      }
    },
  };
}
