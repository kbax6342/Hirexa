// my-app/app/lib/stripeClient.ts
import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY in my-app/.env.local');
  }

  if (!stripe) {
    stripe = new Stripe(key, {
      apiVersion: "2026-01-28.clover",
    });
  }

  return stripe;
}
