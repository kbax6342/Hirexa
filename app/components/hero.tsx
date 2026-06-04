"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  BoltIcon,
  BriefcaseIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

import { Button } from "../components/ui/button";

const jobCards = [
  {
    abbr: "a",
    bgColor: "bg-[#232f3e]",
    textColor: "text-[#ff9900]",
    role: "Customer Success Manager",
  },
  {
    abbr: "IBM",
    bgColor: "bg-[#0f62fe]",
    textColor: "text-white",
    role: "Data Scientist",
  },
  {
    abbr: "Uber",
    bgColor: "bg-black",
    textColor: "text-white",
    role: "Marketing Specialist",
  },
  {
    abbr: "S",
    bgColor: "bg-[#96bf48]",
    textColor: "text-white",
    role: "Product Designer",
  },
];

const mobileBenefits = [
  {
    icon: SparklesIcon,
    title: "AI-Powered Matching",
    description: "Find better-fit roles based on your profile, skills, and goals.",
  },
  {
    icon: BoltIcon,
    title: "Apply Smarter",
    description: "Create stronger resumes, cover letters, and outreach with less manual work.",
  },
];

const desktopStats = [
  { value: "Smart Matches", label: "Personalized to your profile" },
  { value: "AI Tools", label: "Apply smarter across every stage" },
  { value: "One Place", label: "Search, apply, and prepare faster" },
];

export function Hero({ href }: { href: string }) {
  const router = useRouter();
  const isAuthed = href === "/dashboard";
  const mobilePrimaryHref = isAuthed ? "/dashboard" : "/onboarding/job-interest";
  const desktopPrimaryHref = isAuthed ? "/dashboard" : href;
  const mobilePrimaryLabel = isAuthed ? "Open Dashboard" : "Get Started Free";
  const desktopPrimaryLabel = isAuthed ? "Go to Dashboard" : "Get Started Free";
  const mobileLoginHref = "/login";

  async function handleGetStarted(
    event: MouseEvent<HTMLAnchorElement>,
    targetHref: string
  ) {
    if (targetHref === "/dashboard") {
      return;
    }

    event.preventDefault();

    try {
      await fetch("/api/onboarding/start", {
        method: "POST",
        cache: "no-store",
      });
    } catch {
      // The profile page will retry guest bootstrap if this request fails.
    }

    router.push(targetHref);
  }

  return (
    <section className="relative overflow-hidden py-8 md:pb-24 md:pt-36">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-sky-500/18 blur-[110px] md:hidden" />
        <div className="absolute left-[-12%] top-40 h-72 w-72 rounded-full bg-blue-600/12 blur-[120px] md:hidden" />
        <div className="absolute right-[-14%] top-56 h-72 w-72 rounded-full bg-cyan-400/10 blur-[130px] md:hidden" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.09),transparent_34%)] md:hidden" />
        <div className="absolute left-1/3 top-1/4 hidden h-[500px] w-[600px] rounded-full bg-primary/8 blur-[120px] md:block" />
        <div className="absolute bottom-0 right-1/4 hidden h-[400px] w-[500px] rounded-full bg-accent/6 blur-[100px] md:block" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 sm:px-6">
        <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-md flex-col justify-between md:hidden">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-100">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-[10px] font-bold tracking-normal text-white">
                  H
                </span>
                Hirexa AI
              </div>

              <Button
                asChild
                variant="outline"
                className="h-9 rounded-full border-white/12 bg-white/[0.05] px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-white hover:bg-white/[0.1] hover:text-white"
              >
                <Link href={mobileLoginHref}>
                  <UserCircleIcon className="h-4 w-4" />
                  Log In
                </Link>
              </Button>
            </div>

            <div className="mt-6 text-center">
              <h1 className="text-balance font-heading text-[3rem] font-semibold leading-[0.94] tracking-tight text-white">
                Find Better Jobs With AI
              </h1>

              <p className="mt-3 text-[18px] leading-7 text-slate-300">
                Join the platform that uses advanced AI to match you with
                opportunities tailored to your professional identity.
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            {mobileBenefits.map((benefit) => {
              const Icon = benefit.icon;

              return (
                <div key={benefit.title} className="px-1 py-1">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-200">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-white">
                        {benefit.title}
                      </p>
                      <p className="mt-0.5 text-[13px] leading-5 text-slate-300">
                        {benefit.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative mt-5 overflow-hidden rounded-[28px] border border-slate-200/90 bg-white p-4 shadow-[0_24px_70px_-35px_rgba(15,23,42,0.35)]">
            <div className="pointer-events-none absolute inset-x-10 mt-[-4rem] h-32 rounded-full bg-sky-500/10 blur-[90px]" />

            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
                <BriefcaseIcon className="h-4 w-4" />
                Start Here
              </div>

              <h2 className="mt-3 text-lg font-semibold tracking-tight text-slate-950">
                Build your profile once. Let Hirexa help across the journey.
              </h2>
              <p className="mt-1.5 text-[13px] leading-5 text-slate-600">
                Unlock Smart Matches, AI application support, and career tools in
                one focused workflow.
              </p>

              <div className="mt-4 space-y-2">
                <Button
                  asChild
                  size="lg"
                  className="h-11 w-full rounded-2xl bg-sky-500 text-sm font-semibold text-white shadow-[0_14px_38px_-18px_rgba(14,165,233,0.9)] hover:bg-sky-400"
                >
                  <Link
                    href={mobilePrimaryHref}
                    onClick={(event) => handleGetStarted(event, mobilePrimaryHref)}
                  >
                    {mobilePrimaryLabel}
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="h-10 w-full rounded-2xl border-sky-200 bg-sky-50 text-sm font-semibold text-sky-800 shadow-[0_10px_24px_-18px_rgba(14,165,233,0.75)] hover:bg-sky-100 hover:text-sky-900"
                >
                  <Link href="/jobs">
                    Browse Jobs
                    <MagnifyingGlassIcon className="h-4 w-4" />
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="h-10 w-full rounded-2xl border-slate-200 bg-white text-sm font-semibold text-slate-900 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.18)] hover:bg-slate-50"
                >
                  <Link href="/demo/minutemen-ai-chat">
                    AI Chat Demo
                    <ChatBubbleLeftRightIcon className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>

        </div>

        <div className="hidden md:block lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:items-center lg:gap-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-100 backdrop-blur-xl">
              <SparklesIcon className="h-4 w-4" />
              AI-Powered Job Search
            </div>

            <h1 className="mt-7 font-heading text-5xl font-bold leading-[1.02] tracking-tight text-white text-balance lg:text-6xl">
              Find better jobs.
              <span className="mt-2 block text-sky-400">Apply smarter.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              Hirexa AI helps you discover relevant opportunities, strengthen your
              application materials, and use practical AI tools across your job
              search journey.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button
                asChild
                size="lg"
                className="group h-12 rounded-full bg-sky-500 px-8 text-base font-semibold text-white shadow-[0_18px_45px_-22px_rgba(14,165,233,0.75)] transition hover:bg-sky-400"
              >
                <Link
                  href={desktopPrimaryHref}
                  onClick={(event) => handleGetStarted(event, desktopPrimaryHref)}
                >
                  {desktopPrimaryLabel}
                  <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-full border-white/12 bg-white/[0.04] px-8 text-base font-medium text-slate-100 hover:bg-white/[0.08] hover:text-white"
              >
                <Link href="/jobs">Browse Jobs</Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-full border-white/12 bg-white/[0.04] px-8 text-base font-medium text-slate-100 hover:bg-white/[0.08] hover:text-white"
              >
                <Link href="/demo/minutemen-ai-chat">
                  AI Chat Demo
                  <ChatBubbleLeftRightIcon className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {desktopStats.map((stat) => (
                <div
                  key={stat.value}
                  className="rounded-[24px] border border-white/10 bg-white/[0.04] px-5 py-5 backdrop-blur-xl"
                >
                  <p className="text-base font-semibold text-white">{stat.value}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="absolute inset-0 rounded-[34px] bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.18),transparent_48%)] blur-2xl" />
            <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_30px_120px_-55px_rgba(14,165,233,0.65)] backdrop-blur-2xl">
              <div className="rounded-[28px] border border-white/10 bg-[#09111f]/90 p-6">
                <div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Smart Workflow
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                      One place to match, apply, and prepare.
                    </h2>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-4">
                  {jobCards.map((card) => (
                    <div
                      key={card.role}
                      className="flex items-center gap-4 rounded-[22px] border border-white/10 bg-white/[0.04] px-5 py-4 shadow-[0_18px_55px_-38px_rgba(2,8,23,0.95)]"
                    >
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${card.bgColor}`}
                      >
                        <span className={`text-xs font-bold ${card.textColor}`}>
                          {card.abbr}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">{card.role}</p>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-sky-200">
                          <CheckCircleIcon className="h-4 w-4" />
                          Matched and ready to review
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 hidden h-32 md:block">
        <svg
          viewBox="0 0 1440 120"
          fill="none"
          className="absolute bottom-0 w-full"
          preserveAspectRatio="none"
        >
          <path
            d="M0 60C240 20 480 100 720 60C960 20 1200 100 1440 60V120H0V60Z"
            fill="hsl(230 55% 6%)"
            fillOpacity="0.5"
          />
          <path
            d="M0 80C360 40 720 110 1080 70C1260 50 1380 90 1440 80V120H0V80Z"
            stroke="hsl(210 100% 56%)"
            strokeOpacity="0.15"
            strokeWidth="1"
            fill="none"
          />
        </svg>
      </div>
    </section>
  );
}
