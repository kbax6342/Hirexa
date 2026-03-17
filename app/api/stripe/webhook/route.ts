// Legacy compatibility alias. Canonical Stripe webhook logic lives at /api/webhooks/stripe.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { POST } from "../../webhooks/stripe/route";
