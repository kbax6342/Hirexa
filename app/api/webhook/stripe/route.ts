// Compatibility alias for Stripe's current production dashboard path.
// Canonical Stripe webhook logic lives at /api/webhooks/stripe.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { POST } from "../../webhooks/stripe/route";
