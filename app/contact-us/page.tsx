import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us | Hirexa AI",
  description:
    "Contact Hirexa AI support for billing questions, technical issues, account help, and partnerships.",
};

const supportEmail = process.env.EMAIL_SUPPORT ?? "support@hirexa.ai";

const contactCards = [
  {
    title: "Billing and subscriptions",
    body: "Questions about invoices, renewals, cancellations, or HirePilot credits.",
  },
  {
    title: "Technical issues",
    body: "Resume upload problems, login issues, broken workflows, or Smart Matches behavior.",
  },
  {
    title: "Account help",
    body: "Profile updates, access questions, onboarding issues, or security concerns.",
  },
  {
    title: "Partnerships and business",
    body: "Product partnerships, recruiting teams, integrations, or general business inquiries.",
  },
] as const;

export default function ContactUsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto max-w-5xl px-6 py-20">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.35)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">
            Support
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Contact Us
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/80">
            Reach out if you need help with billing, technical issues, profile access,
            onboarding, or product questions. Include the page you were using and any
            screenshots that might help us investigate faster.
          </p>
          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <div className="text-sm font-semibold text-white">Support email</div>
            <a
              href={`mailto:${supportEmail}`}
              className="mt-2 inline-block text-lg font-semibold text-sky-300 hover:underline"
            >
              {supportEmail}
            </a>
            <p className="mt-2 text-sm text-white/70">
              We aim to respond as quickly as possible. Complex billing or account
              reviews can take longer when provider verification is required.
            </p>
          </div>
        </section>

        <section className="mt-10 grid gap-6 md:grid-cols-2">
          {contactCards.map((card) => (
            <div
              key={card.title}
              className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6"
            >
              <h2 className="text-xl font-semibold text-white">{card.title}</h2>
              <p className="mt-3 text-sm leading-7 text-white/80">{card.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
