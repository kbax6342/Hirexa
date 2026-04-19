import type { Metadata } from "next";
import Link from "next/link";
import {
  BoltIcon,
  BriefcaseIcon,
  ChatBubbleLeftRightIcon,
  CreditCardIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";

export const metadata: Metadata = {
  title: "How It Works | Hirexa AI",
  description:
    "Learn how Hirexa AI uses your profile, resume, Smart Matches, AI tools, HirePilot credits, and billing settings to support your job search.",
};

const overviewCards = [
  {
    title: "Build your profile once",
    description:
      "Your profile, resume, experience, and preferences become the core context for matching, application tools, and interview support.",
    icon: DocumentTextIcon,
  },
  {
    title: "Get smarter job matches",
    description:
      "Smart Matches use your target role, location, and job-search signals to surface more relevant jobs across supported providers.",
    icon: BriefcaseIcon,
  },
  {
    title: "Turn advice into action",
    description:
      "Use AI Apply, Career Coach, and HirePilot to act on opportunities faster without losing control over the final output.",
    icon: BoltIcon,
  },
];

const safetyPoints = [
  "Always review AI-generated resumes, coaching guidance, and answers before you use them.",
  "Your saved profile and resume context improves quality, but human judgment still matters.",
  "Use Settings to manage billing, credits, cancellations, and account controls in one place.",
];

const supportLinks = [
  { label: "Smart Matches", href: "/dashboard" },
  { label: "AI Apply", href: "/job-tools/generate" },
  { label: "Career Coach", href: "/job-tools/career-coach" },
  { label: "HirePilot", href: "/hirepilot" },
];

export default function HowItWorksPage() {
  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden text-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.16),transparent_52%),radial-gradient(circle_at_20%_24%,rgba(59,130,246,0.12),transparent_34%),radial-gradient(circle_at_78%_10%,rgba(56,189,248,0.1),transparent_30%)]" />
      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-sky-100 via-white to-sky-50 px-6 py-10 sm:px-10">
            <Badge className="border-sky-200 bg-sky-100 text-sky-700 hover:bg-sky-100">
              Product Guide
            </Badge>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              How Hirexa AI works
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-700 sm:text-lg">
              Hirexa AI helps you move from profile setup to job discovery, applications,
              coaching, and interview preparation with one connected workflow.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
              >
                View Smart Matches
              </Link>
              <Link
                href="/billing-and-credits"
                className="inline-flex items-center rounded-full border border-sky-200 bg-white px-5 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
              >
                Billing & Credits
              </Link>
            </div>
          </div>

          <div className="grid gap-5 px-6 py-8 sm:px-10 lg:grid-cols-3">
            {overviewCards.map((card) => (
              <div
                key={card.title}
                className="rounded-3xl border border-sky-100 bg-white p-5 shadow-sm"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <card.icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-slate-900">{card.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <Card className="rounded-[28px] border-slate-200 bg-white text-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-slate-900">
                <SparklesIcon className="h-5 w-5 text-sky-600" />
                What Hirexa AI does
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
              <p>
                Hirexa AI combines your profile, resume, experience, skills, and preferences to
                improve job discovery and the quality of AI-generated outputs.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Smart Matches uses your saved preferences to prioritize relevant roles.</li>
                <li>AI application tools help draft tailored application materials faster.</li>
                <li>Career Coach helps you turn strong matches into a clearer action plan.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-slate-200 bg-white text-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-slate-900">
                <DocumentTextIcon className="h-5 w-5 text-sky-600" />
                Why profile and resume data matter
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
              <p>
                The more complete your profile is, the better Hirexa AI can interpret your target
                role, location preferences, salary expectations, and experience history.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Resume upload can help seed experience and role-matching signals.</li>
                <li>Preferred locations help job search stay aligned with where you want to work.</li>
                <li>Benefits and compensation preferences help personalize recommendations.</li>
              </ul>
            </CardContent>
          </Card>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <Card className="rounded-[28px] border-slate-200 bg-white text-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-slate-900">
                <ChatBubbleLeftRightIcon className="h-5 w-5 text-sky-600" />
                What HirePilot does
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
              <p>
                HirePilot helps with interview preparation and live interview support using your
                Hirexa profile context. Practice mode is separate from paid live interview usage.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Practice questions help you rehearse before a real interview.</li>
                <li>Live listening uses HirePilot credits when available.</li>
                <li>Suggested answers should always be reviewed before you rely on them.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-slate-200 bg-white text-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-slate-900">
                <CreditCardIcon className="h-5 w-5 text-sky-600" />
                How credits and billing work
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
              <ul className="list-disc space-y-2 pl-5">
                <li>Monthly included HirePilot credits reset on the billing cycle.</li>
                <li>Purchased top-up credits stay available until their expiration date.</li>
                <li>Monthly credits are used before purchased credits.</li>
                <li>Settings shows billing details, renewal dates, and remaining HirePilot credits.</li>
              </ul>
              <p>
                Manage billing, cancellations, and product-specific details from the{" "}
                <Link
                  href="/settings/subscription"
                  className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-sky-700"
                >
                  Subscription settings
                </Link>{" "}
                page.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="rounded-[28px] border-slate-200 bg-white text-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-slate-900">
                <ShieldCheckIcon className="h-5 w-5 text-sky-600" />
                Privacy, review, and support
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
              <p>
                Hirexa AI is designed to help you move faster, not to replace your judgment.
                Review AI-generated answers, resumes, and coaching guidance before you use them.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                {safetyPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-4 text-sm">
                <Link
                  href="/privacy/"
                  className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-sky-700"
                >
                  Privacy Policy
                </Link>
                <Link
                  href="/terms/"
                  className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-sky-700"
                >
                  Terms of Service
                </Link>
                <Link
                  href="/fraud-awareness"
                  className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-sky-700"
                >
                  Fraud Awareness
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-slate-200 bg-white text-slate-900 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-900">Explore the platform</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {supportLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                >
                  <span>{link.label}</span>
                  <span aria-hidden="true">-&gt;</span>
                </Link>
              ))}
              <div className="rounded-2xl border border-slate-200 bg-sky-50 px-4 py-4 text-sm leading-6 text-slate-700">
                Need help? Contact{" "}
                <a
                  href="mailto:support@hirexa-ai.com"
                  className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-sky-700"
                >
                  support@hirexa-ai.com
                </a>
                .
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
