import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

import { Footer } from "@/app/components/footer";
import { Badge } from "@/app/components/ui/badge";
import NewsletterSignupForm from "@/app/newsletter/NewsletterSignupForm";

export const metadata: Metadata = {
  title: "Hirexa AI Newsletter | Practical Job Search Updates",
  description:
    "Get Hirexa AI product updates, resume and application tips, interview insights, and hiring trends designed to help you move faster with less guesswork.",
};

const valueCards = [
  {
    title: "Product updates that make Hirexa more useful",
    description:
      "Hear when Smart Matches, AI Assistant Apply, HirePilot, and profile workflows get faster, clearer, or more effective.",
    icon: SparklesIcon,
  },
  {
    title: "Resume and application guidance you can use now",
    description:
      "Get practical tips for tailoring resumes, improving applications, and tightening follow-up messages without filler.",
    icon: DocumentTextIcon,
  },
  {
    title: "Interview prep and answer strategy",
    description:
      "Learn what stronger interview answers look like and how to prepare using your real experience instead of generic scripts.",
    icon: ChatBubbleLeftRightIcon,
  },
  {
    title: "Hiring signals worth paying attention to",
    description:
      "We translate hiring trends, workflow changes, and recruiter expectations into next steps that actually help your search.",
    icon: ChartBarIcon,
  },
] as const;

const sampleIssues = [
  {
    label: "Product + Workflow",
    date: "March 2026",
    title: "Moving from Smart Matches to tailored applications with less friction",
    summary:
      "A practical walkthrough of how Hirexa’s job discovery, AI Assistant Apply, and saved-profile context are starting to work together more cleanly.",
    bullets: ["Smarter match triage", "Faster job-to-resume handoff", "Cleaner next steps"],
    href: "/newsletter#newsletter-signup",
  },
  {
    label: "Resume + Apply",
    date: "March 2026",
    title: "How to make a generated resume feel stronger before you send it",
    summary:
      "A focused breakdown of what to review in your summary, bullets, and keywords so the final document feels credible, specific, and ATS-ready.",
    bullets: ["Stronger bullet phrasing", "Cleaner skill targeting", "Less generic output"],
    href: "/newsletter#newsletter-signup",
  },
  {
    label: "Interview + Hiring",
    date: "March 2026",
    title: "What hiring teams respond to in interview answers right now",
    summary:
      "How to make answers sound more grounded, more specific, and more aligned with the role without turning them into over-rehearsed scripts.",
    bullets: ["STAR without sounding robotic", "Specific examples over claims", "Clearer follow-up prep"],
    href: "/newsletter#newsletter-signup",
  },
] as const;

const heroChips = [
  "Product updates",
  "Resume and application tips",
  "Interview insights",
  "Hiring trends",
] as const;

export default function NewsletterPage() {
  return (
    <div className="min-h-screen bg-[#050816] pt-24 text-white">
      <main className="relative mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.24),transparent_52%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_32%)]" />

        <section className="overflow-hidden rounded-[2rem] bg-[#050816]">
          <div className="grid gap-8 px-6 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1.15fr_0.85fr] lg:px-10 lg:py-12">
            <div className="space-y-8">
              <div>
                <Badge className="border-sky-300/20 bg-sky-500/10 text-sky-100 hover:bg-sky-500/10">
                  Hirexa AI Newsletter
                </Badge>
                <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Practical job search updates from Hirexa AI
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
                  Get product updates, resume tips, smarter application strategies, interview
                  insights, and hiring trends designed to help you move faster with less
                  guesswork.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {heroChips.map((chip) => (
                  <div
                    key={chip}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
                  >
                    {chip}
                  </div>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-200">
                    <BriefcaseIcon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-white">
                    Built around the way Hirexa is actually used
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    The newsletter focuses on discovery, application quality, interview prep, and
                    workflow improvements inside the product.
                  </p>
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-200">
                    <SparklesIcon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-white">
                    Clear updates, not generic marketing filler
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Expect practical notes on what changed, what matters, and how to use it in a
                    real job search.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:pl-4">
              <NewsletterSignupForm />
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200/80">
              What You&apos;ll Get
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              A tighter signal for your job search
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-300">
              The goal is simple: help you understand what changed, what is useful, and what to do
              next inside Hirexa AI and in the market around it.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {valueCards.map((card) => (
              <div
                key={card.title}
                className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_18px_50px_-38px_rgba(14,165,233,0.55)] backdrop-blur-sm"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-200">
                  <card.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{card.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200/80">
                Latest From The Newsletter
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                The kind of updates you can expect
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-300">
                These are sample issue themes for now, written to match the practical tone of the
                real newsletter and easy to replace later with live content.
              </p>
            </div>

            <Link
              href="/newsletter#newsletter-signup"
              className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Subscribe for updates
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {sampleIssues.map((issue) => (
              <Link
                key={issue.title}
                href={issue.href}
                className="group rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_18px_50px_-38px_rgba(14,165,233,0.45)] backdrop-blur-sm transition hover:border-sky-300/25 hover:bg-white/[0.06]"
              >
                <div className="flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-[0.18em] text-sky-200/80">
                  <span>{issue.label}</span>
                  <span className="text-slate-400">{issue.date}</span>
                </div>

                <h3 className="mt-4 text-xl font-semibold leading-8 text-white transition group-hover:text-sky-100">
                  {issue.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{issue.summary}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {issue.bullets.map((bullet) => (
                    <span
                      key={bullet}
                      className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs text-slate-200"
                    >
                      {bullet}
                    </span>
                  ))}
                </div>

                <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-sky-200">
                  Get updates in your inbox
                  <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-12 overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(12,22,46,0.95),rgba(3,7,18,0.92))] px-6 py-8 shadow-[0_28px_80px_-48px_rgba(14,165,233,0.5)] sm:px-8 lg:px-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200/80">
                Stay In The Loop
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                Get the next practical Hirexa AI update in your inbox
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-300">
                Subscribe for clean product notes, application and interview guidance, and useful
                workflow ideas you can act on right away.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/newsletter#newsletter-signup"
                className="inline-flex items-center justify-center rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400"
              >
                Subscribe Now
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                See How Hirexa Works
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
