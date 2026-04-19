import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help Center | Hirexa AI",
  description:
    "Get help with Hirexa AI account access, resume uploads, Smart Matches, applications, billing, and product troubleshooting.",
};

const supportEmail = process.env.EMAIL_SUPPORT ?? "support@hirexa-ai.com";

const sections = [
  {
    title: "Account and login",
    items: [
      "Use the login page to sign back in, reset your flow, or continue onboarding.",
      "If you signed up as a guest first, Hirexa will merge your profile once you authenticate.",
      "If account access looks wrong, contact support before creating a duplicate profile.",
    ],
  },
  {
    title: "Resume uploads and profile setup",
    items: [
      "Upload a PDF resume or paste resume text to seed your profile and experience history.",
      "After resume review, your saved resume and parsed experience appear on your Profile page.",
      "You can add or edit experience later from Profile without re-uploading your resume.",
    ],
  },
  {
    title: "Smart Matches and applications",
    items: [
      "Use Smart Matches filters for role, location, and remote preferences to narrow the feed.",
      "Apply Tool, Career Coach, and other actions are designed to work from the same saved profile signals.",
      "If a match looks stale or sparse, refresh your preferences and target role on the Profile page.",
    ],
  },
  {
    title: "Career Coach and HirePilot",
    items: [
      "Career Coach uses your Hirexa AI plan and profile context to generate structured coaching guidance.",
      "HirePilot supports interview preparation and live assistance when access or credits are available.",
      "If you do not have a resume yet, you can still use profile-based guidance and upload later.",
    ],
  },
  {
    title: "Billing, subscriptions, and credits",
    items: [
      "Use Settings > Subscription to view product status, manage billing, and review invoice links.",
      "HirePilot credits and recurring access are shown separately so balances are easier to understand.",
      "Account deletion and subscription cancellation have separate confirmation flows for safety.",
    ],
  },
  {
    title: "Troubleshooting",
    items: [
      "Refresh the page after major profile or billing changes if a status looks outdated.",
      "If a tool says resume context is missing, confirm the resume is visible on your Profile page.",
      "For persistent issues, include screenshots and the page URL when you contact support.",
    ],
  },
] as const;

export default function HelpCenterPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto max-w-6xl px-6 py-20">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.35)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">
            Support
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Help Center
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/80">
            Find practical help for account access, resume uploads, Smart Matches,
            Career Coach, HirePilot, billing, and common troubleshooting steps.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/contact-us"
              className="inline-flex items-center rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"
            >
              Contact Support
            </Link>
            <a
              href={`mailto:${supportEmail}`}
              className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              {supportEmail}
            </a>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          {sections.map((section) => (
            <div
              key={section.title}
              className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6"
            >
              <h2 className="text-xl font-semibold text-white">{section.title}</h2>
              <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-white/80">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
