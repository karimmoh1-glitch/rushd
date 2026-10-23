import { billingConfigured, stripe } from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/webhook";
import { log } from "@/lib/log";
import { requestIdFrom, withRequestIdHeader } from "@/lib/request-id";

export const runtime = "nodejs";

/** Stripe → Rushd. Rejects anything without a valid signature. */
export async function POST(request: Request) {
  const requestId = requestIdFrom(request.headers);
  const respond = (response: Response) => withRequestIdHeader(response, requestId);
  if (!billingConfigured()) {
    return respond(new Response("Billing not configured", { status: 503 }));
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return respond(new Response("Missing signature", { status: 400 }));
  }

  const body = await request.text();
  let event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    log.warn("stripe.webhook_bad_signature", { requestId });
    return respond(new Response("Invalid signature", { status: 400 }));
  }
  try {
    const outcome = await handleStripeEvent(event);
    log.info("stripe.webhook_processed", { requestId, type: event.type, eventId: event.id, outcome });
    return respond(Response.json({ received: true, outcome }));
  } catch (error) {
    log.error("stripe.webhook_failed", { requestId, type: event.type, eventId: event.id, err: error });
    // A 500 makes Stripe retry later; the event isn't recorded, so the retry reprocesses it.
    return respond(new Response("Processing failed", { status: 500 }));
  }
}
