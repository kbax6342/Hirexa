import type { Metadata } from "next";
import {
  EnvelopeIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassCircleIcon,
  NoSymbolIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

export const metadata: Metadata = {
  title: "Fraud Awareness | Hirexa AI",
  description:
    "Learn how to identify job-search scams, verify official Hirexa communication, and report suspicious activity safely.",
};

const warningSigns = [
  "Requests for payment to unlock job opportunities, interviews, or placement assistance.",
  "Asking for bank account details, Social Security numbers, or other sensitive data before a legitimate hiring process is established.",
  "Recruiters contacting you from suspicious domains or accounts that do not clearly match the employer.",
  "Pressure tactics, rushed deadlines, or messages designed to make you act before verifying details.",
  "Job offers that seem unusually generous with little screening or no clear hiring process.",
  "Interviews conducted only through chat apps or text with no credible company verification.",
  "Vague job descriptions, inconsistent company information, or unclear expectations about the role.",
];

const hirexaWillNeverDo = [
  "Guarantee employment or promise a job outcome.",
  "Ask for payment through gift cards, cryptocurrency, or wire transfer.",
  "Request highly sensitive personal information through unverified channels.",
  "Ask you to send money in order to receive job opportunities or interviews.",
  "Tell you to ignore suspicious behavior, inconsistencies, or pressure tactics.",
];

const verifyGuidance = [
  "Check the sender domain carefully and confirm it matches known Hirexa communication.",
  "Make sure you are on the official Hirexa website before entering information.",
  "Be cautious with unexpected links, downloadable files, or urgent requests.",
  "If a message feels unusual, pause and confirm through official support channels before responding.",
];

const fraudResponseSteps = [
  "Stop responding and do not send money, identity documents, or sensitive information.",
  "Take screenshots or save copies of the message, recruiter details, and any linked job posting.",
  "Report the suspicious activity so it can be reviewed and documented.",
  "Change passwords if you shared login credentials or clicked suspicious links.",
  "Monitor bank accounts, credit activity, and identity-related services if sensitive data was exposed.",
];

export default function FraudAwarenessPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef4fb_100%)]">
      <main className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <section className="relative overflow-hidden rounded-[32px] border border-slate-200/70 bg-slate-950 px-6 py-10 shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:px-10 sm:py-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,211,238,0.18),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(59,130,246,0.18),_transparent_40%)]" />
          <div className="relative max-w-3xl">
            <Badge className="border border-sky-300/25 bg-sky-400/10 px-3 py-1 text-sky-100">
              Trust &amp; Safety
            </Badge>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Fraud Awareness
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-200 sm:text-lg">
              Hirexa AI wants every user to stay safe throughout the job search
              process. This page outlines common scam warning signs, how to
              verify official Hirexa communication, and what to do if something
              feels suspicious.
            </p>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-3xl border-slate-200/80 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur">
            <CardHeader className="gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <ExclamationTriangleIcon className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl text-slate-950">
                  Common Job Scam Warning Signs
                </CardTitle>
                <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
                  Scams often rely on urgency, poor verification, and requests
                  for information or money before a legitimate process is in
                  place.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3 sm:grid-cols-2">
                {warningSigns.map((item) => (
                  <li
                    key={item}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-200/80 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur">
            <CardHeader className="gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <ShieldCheckIcon className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl text-slate-950">
                  Safety First
                </CardTitle>
                <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
                  Legitimate hiring processes should be transparent, verifiable,
                  and respectful of your personal information.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-700">
              <p>
                If an employer or recruiter asks you to move quickly, pay money,
                or bypass normal verification, treat that as a reason to pause.
              </p>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-900">
                Real opportunities should stand up to basic checks: a real
                company presence, a clear role, and communication that matches
                the organization behind it.
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <Card className="rounded-3xl border-slate-200/80 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur">
            <CardHeader className="gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                <NoSymbolIcon className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl text-slate-950">
                  What Hirexa Will Never Do
                </CardTitle>
                <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
                  These are clear red flags if anyone claims to represent
                  Hirexa.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {hirexaWillNeverDo.map((item) => (
                  <li
                    key={item}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-200/80 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur">
            <CardHeader className="gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <MagnifyingGlassCircleIcon className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl text-slate-950">
                  How To Verify Hirexa Communication
                </CardTitle>
                <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
                  A short pause to verify can prevent a much larger problem.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {verifyGuidance.map((item) => (
                  <li
                    key={item}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <Card className="rounded-3xl border-slate-200/80 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur">
            <CardHeader>
              <CardTitle className="text-2xl text-slate-950">
                What To Do If You Suspect Fraud
              </CardTitle>
              <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
                If something feels off, act deliberately and protect your
                information first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {fraudResponseSteps.map((item, index) => (
                  <li
                    key={item}
                    className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-6 text-slate-700">
                      {item}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-200/80 bg-slate-950 text-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <CardHeader className="gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-sky-200">
                <EnvelopeIcon className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl text-white">
                  Report Suspicious Activity
                </CardTitle>
                <CardDescription className="mt-2 text-sm leading-6 text-slate-300">
                  If you believe you encountered suspicious activity on or around
                  Hirexa, contact support so the issue can be reviewed.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-6 text-slate-200">
                Share as much detail as you can, such as the message, sender,
                job title, links, screenshots, and when the interaction took
                place. That helps the trust and support review move faster.
              </div>
              <a
                href="mailto:support@hirexa-ai.com"
                className="inline-flex items-center rounded-full bg-sky-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
              >
                support@hirexa-ai.com
              </a>
              <p className="text-sm leading-6 text-slate-300">
                If you shared financial or identity information, contact the
                relevant providers immediately and consider independent fraud
                reporting steps based on your location.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="mt-10">
          <div className="rounded-[28px] border border-slate-200/80 bg-white/80 px-6 py-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur sm:px-8">
            <p className="text-base font-medium text-slate-900">
              If something feels suspicious, pause and verify before taking
              action.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Taking a few moments to confirm who you are speaking with can
              protect your identity, finances, and job search momentum.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
