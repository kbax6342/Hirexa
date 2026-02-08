import Stripe from "stripe";

/**
 * Stripe Client singleton.
 * - Uses the SDK’s pinned API version automatically (you do NOT set apiVersion).
 * - Throws a helpful error if STRIPE_SECRET_KEY is missing.
 */
let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY. Add it to /Hirexa/my-app/.env.local (e.g., STRIPE_SECRET_KEY=sk_test_***)"
    );
  }

  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }

  return stripeClient;
}
