import { prisma } from "@/lib/db";
import { dispatch } from "@/lib/notifications/dispatch";
import { constructWebhookEvent, getStripeGateway } from "@/lib/stripe/client";
import { handleStripeEvent } from "@/lib/training/services/stripe-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe Connect webhook (events from the coaches' accounts), verified on the raw body with
 * STRIPE_CONNECT_WEBHOOK_SECRET. 400 when the signature does not match, 500 so Stripe retries when handling fails.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  let event;
  try {
    if (!signature) throw new Error("missing stripe-signature");
    event = constructWebhookEvent(body, signature);
  } catch {
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }
  try {
    const intents = await handleStripeEvent(prisma, getStripeGateway(), {
      id: event.id,
      type: event.type,
      account: event.account ?? null,
      object: event.data.object as unknown as Record<string, unknown>,
    });
    dispatch(intents);
  } catch (e) {
    console.error("stripe webhook failed", event.type, event.id, e);
    return Response.json({ error: "handler failed" }, { status: 500 });
  }
  return Response.json({ received: true });
}
