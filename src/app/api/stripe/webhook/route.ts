import { billingConfigured, stripe } from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/webhook";

export const runtime = "nodejs";

/** Stripe → Rushd. Rejects anything without a valid signature. */
export async function POST(request: Request) {
  if (!billingConfigured()) {
    return new Response("Billing not configured", { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  const body = await request.text();
  let event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    const outcome = await handleStripeEvent(event);
    return Response.json({ received: true, outcome });
  } catch (error) {
    console.error("[stripe] webhook processing failed", event.type, (error as Error)?.name ?? typeof error);
    // A 500 makes Stripe retry later; the event isn't recorded, so the retry reprocesses it.
    return new Response("Processing failed", { status: 500 });
  }
}
