import type { Metadata } from "next";
import {
  NewspaperIcon,
  SparklesIcon,
  BriefcaseIcon,
} from "@heroicons/react/24/outline";

import { Footer } from "@/app/components/footer";
import { Badge } from "@/app/components/ui/badge";
import NewsletterSignupForm from "@/app/newsletter/NewsletterSignupForm";

export const metadata: Metadata = {
  title: "Newsletter | Hirexa AI",
  description:
    "Subscribe to the Hirexa AI newsletter for product updates, hiring insights, job search tips, and new feature launches.",
};

const newsletterHighlights = [
  {
    title: "Product updates that matter",
    description:
      "Get feature launches and workflow improvements that can help you move faster in your job search.",
    icon: SparklesIcon,
  },
  {
    title: "Hiring insights and practical tips",
    description:
      "Stay current on how to improve your profile, resume, applications, and outreach without the noise.",
    icon: BriefcaseIcon,
  },
  {
    title: "Built for real job seekers",
    description:
      "Hirexa AI shares straightforward updates designed to help you find better roles and act on them faster.",
    icon: NewspaperIcon,
  },
] as const;

export default function NewsletterPage() {
  return (
    <div className="min-h-screen bg-slate-50 pt-24 text-slate-900">
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-sky-600 via-sky-500 to-cyan-500 px-6 py-12 text-white sm:px-10">
            <Badge className="border-white/25 bg-white/10 text-white hover:bg-white/10">
              Newsletter
            </Badge>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Get smarter job search updates from Hirexa AI
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-sky-50 sm:text-lg">
              Product updates, hiring insights, job search tips, and new feature launches,
              delivered with a practical job-seeker focus.
            </p>
          </div>

          <div className="grid gap-6 px-6 py-8 sm:px-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm leading-7 text-slate-600">
                  Hirexa AI helps you discover roles, strengthen applications, and move faster
                  with AI-assisted job search tools. The newsletter keeps you up to date without
                  flooding your inbox.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                {newsletterHighlights.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <h2 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <NewsletterSignupForm />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
