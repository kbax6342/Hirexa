import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing and Credits | Hirexa AI",
  description:
    "Learn how Hirexa AI subscriptions and HirePilot credits work, when credits are used, and what happens on cancellation or deletion.",
};

const supportEmail = process.env.EMAIL_SUPPORT ?? "support@hirexa.ai";

export default function BillingAndCreditsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto max-w-5xl px-6 py-20">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.35)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">
            Billing Guide
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Billing and Credits
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/80">
            Hirexa AI and HirePilot are billed differently. This page explains what
            each product charges for, how credits are used, and what happens when an
            account or subscription ends.
          </p>
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold text-white">Hirexa AI subscription</h2>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-white/80">
              <li>Hirexa AI covers core product access such as Smart Matches and coaching tools.</li>
              <li>Subscription details, renewal timing, and invoice links are shown in Settings.</li>
              <li>Cancellation typically turns off auto-renew at the end of the current billing period.</li>
            </ul>
          </section>

          <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold text-white">HirePilot credits</h2>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-white/80">
              <li>HirePilot can include monthly credits and optional purchased credits.</li>
              <li>Credits are deducted when a live HirePilot session starts and access is consumed.</li>
              <li>Monthly credits reset on the billing cycle, while purchased credits can expire later.</li>
            </ul>
          </section>

          <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold text-white">How credits are used</h2>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-white/80">
              <li>Monthly or included credits are consumed before purchased credit grants.</li>
              <li>Expired credits are not used for new sessions.</li>
              <li>Your current balance, recent usage, and upcoming expirations appear in Subscription settings.</li>
            </ul>
          </section>

          <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold text-white">Cancellation and deletion</h2>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-white/80">
              <li>Canceling a recurring subscription stops future renewal after the current billing period ends.</li>
              <li>Deleting an account triggers subscription cancellation handling before profile data is removed.</li>
              <li>If unused purchased credits remain, review the current product messaging in Settings before deleting the account.</li>
            </ul>
          </section>
        </div>

        <section className="mt-10 rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold text-white">Questions about billing?</h2>
          <p className="mt-3 text-sm leading-7 text-white/80">
            For invoice questions, cancellation issues, or unclear credit behavior, contact support
            before making account changes.
          </p>
          <a
            href={`mailto:${supportEmail}`}
            className="mt-4 inline-block text-sm font-semibold text-sky-300 hover:underline"
          >
            {supportEmail}
          </a>
        </section>
      </main>
    </div>
  );
}
