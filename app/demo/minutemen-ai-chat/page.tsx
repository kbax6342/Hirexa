import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  ChatBubbleBottomCenterTextIcon,
  CheckBadgeIcon,
  ClockIcon,
  CubeTransparentIcon,
  GlobeAltIcon,
  MapPinIcon,
  SparklesIcon,
  TruckIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

import StaffingAiDemoShowcase from "@/app/components/demo/StaffingAiDemoShowcase";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { getCompanyChatSettingsBySlug } from "@/app/lib/ai-chat/companyChatSettingsStore";
import { DEFAULT_MINUTEMEN_CHAT_SETTINGS } from "@/app/lib/ai-chat/defaultCompanyChatSettings";

export const metadata: Metadata = {
  title: "Company AI Chat Demo | Hirexa AI",
  description:
    "A Hirexa AI sales demo showing how a staffing or hiring company could use an embedded AI candidate screening chatbot.",
};

type DemoPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const minutemenSolutionCards = [
  {
    title: "Temporary Staffing",
    text: "Rapid fill support for seasonal demand, call-offs, and urgent production needs.",
    icon: ClockIcon,
  },
  {
    title: "Long-Term Staffing",
    text: "Consistent recruiting support for recurring workforce demand and ongoing shifts.",
    icon: UserGroupIcon,
  },
  {
    title: "Direct Hire",
    text: "Candidate screening that helps recruiters surface stronger long-term placements.",
    icon: CheckBadgeIcon,
  },
  {
    title: "On-Site Staffing",
    text: "Recruiter-ready lead capture for high-volume employer programs and managed accounts.",
    icon: BuildingOffice2Icon,
  },
] as const;

const testimonials = [
  {
    quote:
      "This kind of website chat demo makes it easy to show staffing buyers how AI can pre-screen applicants before a recruiter even picks up the phone.",
    name: "Regional Staffing Director",
    role: "Mock testimonial for demo use",
  },
  {
    quote:
      "The lead score and recruiter-ready summary are exactly the kind of handoff a branch team would want for high-volume Dearborn and Metro Detroit roles.",
    name: "Operations Leader",
    role: "Mock testimonial for demo use",
  },
] as const;

const footerColumns = [
  {
    title: "Employers",
    links: ["Request talent", "Managed staffing", "On-site support"],
  },
  {
    title: "Job Seekers",
    links: ["Find a job", "Apply now", "Career resources"],
  },
  {
    title: "Staffing Solutions",
    links: ["Temporary", "Long-term", "Direct hire"],
  },
] as const;

function getAccentColor(color: string | undefined, fallback: string) {
  return color?.trim() || fallback;
}

function buildCompanyHeroHeading(companyName: string, hiringFocus?: string) {
  if (hiringFocus?.trim()) {
    return hiringFocus.trim();
  }

  return `${companyName} hiring and candidate screening demo.`;
}

function MinutemenDemoPage({
  settings,
}: {
  settings: ReturnType<typeof getCompanyChatSettingsBySlug>;
}) {
  const accentColor = getAccentColor(settings.brandPrimaryColor, "#dc2626");
  const demoLocations = settings.locationCoverage ?? [
    "Dearborn",
    "Detroit",
    "Livonia",
    "Romulus",
    "Taylor",
    "Wayne",
  ];

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-20 text-slate-900 sm:pt-24">
      <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:px-2">
          <span className="font-medium">
            This is a Hirexa AI demo concept. It is not affiliated with, endorsed
            by, or approved by Minutemen Staffing.
          </span>
          <span className="text-red-700/80">Demo concept — not affiliated</span>
        </div>
      </div>

      <div className="bg-[#0f1c3d] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-4 px-4 py-3 text-sm font-medium sm:px-6 lg:px-8">
          <a href="#contact" className="transition hover:text-sky-200">
            Employer Login
          </a>
          <a href="#find-job" className="transition hover:text-sky-200">
            Associate Login
          </a>
        </div>
      </div>

      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-[0_18px_45px_-28px_rgba(220,38,38,0.8)]"
              style={{ backgroundColor: accentColor }}
            >
              <BriefcaseIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-red-600">
                Demo concept
              </div>
              <div className="font-heading text-2xl font-bold tracking-tight text-slate-950">
                MINUTEMEN STAFFING DEMO
              </div>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-600">
            <a href="#find-staff" className="transition hover:text-slate-950">
              Find Staff
            </a>
            <a href="#find-job" className="transition hover:text-slate-950">
              Find a Job
            </a>
            <a href="#solutions" className="transition hover:text-slate-950">
              Staffing Solutions
            </a>
            <a href="#industries" className="transition hover:text-slate-950">
              Industries
            </a>
            <a href="#locations" className="transition hover:text-slate-950">
              Locations
            </a>
            <a href="#contact" className="transition hover:text-slate-950">
              Contact
            </a>
          </nav>

          <Button
            asChild
            className="rounded-full px-6 text-white hover:opacity-95"
            style={{ backgroundColor: accentColor }}
          >
            <a href="#live-demo">Apply Now</a>
          </Button>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-[linear-gradient(145deg,#ffffff,#eef4ff)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(220,38,38,0.12),transparent_30%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
            <div className="max-w-3xl">
              <Badge className="border-slate-200 bg-white text-slate-700 shadow-sm">
                LET&apos;S GET TO WORK
              </Badge>
              <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Temporary, long-term, and direct hire workforce solutions.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
                A staffing website demo showing how Hirexa AI can screen job
                seekers, capture candidate leads, and help recruiters prioritize
                qualified applicants.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-[#0f1c3d] px-6 text-white hover:bg-[#162854]"
                >
                  <a href="#find-staff">Find Staff</a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="rounded-full border-slate-300 bg-white px-6 text-slate-900 hover:bg-slate-50"
                >
                  <a href="#find-job">Find a Job</a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  className="rounded-full px-6 text-white hover:opacity-95"
                  style={{ backgroundColor: accentColor }}
                >
                  <a href="#live-demo">
                    AI Chat Demo
                    <ArrowRightIcon className="h-4 w-4" />
                  </a>
                </Button>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Demo value
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    Website-to-recruiter
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Candidate screening without forcing a long application first.
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Candidate capture
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    Contact + consent
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Structured lead data ready for recruiter review and follow-up.
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Prioritization
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    Lead scoring
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Readiness-based scoring and recommended recruiter actions.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center">
              <div className="w-full rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_32px_120px_-60px_rgba(15,23,42,0.35)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">
                      Demo concept — not affiliated
                    </p>
                    <h2 className="mt-2 font-heading text-2xl font-semibold text-slate-950">
                      Embedded staffing AI assistant
                    </h2>
                  </div>
                  <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                    <SparklesIcon className="h-6 w-6" />
                  </div>
                </div>

                <div className="mt-6 grid gap-4">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-[#0f1c3d] p-5 text-white">
                    <div className="flex items-center gap-2 text-sm font-semibold text-sky-200">
                      <ChatBubbleBottomCenterTextIcon className="h-5 w-5" />
                      Candidate screening chatbot
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-200">
                      Greet candidates, ask job-relevant screening questions, and
                      gather recruiter-ready contact details from the website.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <TruckIcon className="h-5 w-5 text-red-600" />
                        Metro Detroit staffing
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Dearborn-focused screening for warehouse, manufacturing,
                        and general labor roles.
                      </p>
                    </div>
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <CubeTransparentIcon className="h-5 w-5 text-red-600" />
                        Recruiter summary
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Every completed screening produces a score, tier, and
                        follow-up recommendation.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="solutions" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-600">
                Staffing Solutions
              </p>
              <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Flexible workforce support for staffing teams and employers
              </h2>
            </div>
            <a
              id="find-staff"
              href="#live-demo"
              className="text-sm font-semibold text-red-600 hover:text-red-500"
            >
              See the AI screening demo
            </a>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {minutemenSolutionCards.map((card) => (
              <Card
                key={card.title}
                className="rounded-[1.75rem] border-slate-200 bg-white shadow-[0_18px_50px_-40px_rgba(15,23,42,0.45)]"
              >
                <CardContent className="p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                    <card.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-slate-950">
                    {card.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{card.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section
          id="industries"
          className="border-y border-slate-200 bg-white/80 py-14"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-600">
                Industries
              </p>
              <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Roles this staffing demo is designed to support
              </h2>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {settings.industries.map((industry) => (
                <div
                  key={industry}
                  className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-5 text-sm font-semibold text-slate-900 shadow-sm"
                >
                  {industry}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="locations" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_22px_70px_-50px_rgba(15,23,42,0.35)] sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-600">
                  Locations
                </p>
                <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-slate-950">
                  Metro Detroit recruiting coverage in this demo concept
                </h2>
              </div>
              <Badge className="border-sky-200 bg-sky-50 text-sky-700">
                {settings.companyLocation}
              </Badge>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {demoLocations.map((location) => (
                <div
                  key={location}
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  {location}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="find-job" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-600">
              Candidate Screening Demo
            </p>
            <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Turn website visitors into screened candidates
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Hirexa AI can engage candidates, collect contact information, ask
              job-relevant questions, score readiness, and create recruiter-ready
              summaries. Use the section below plus the floating AI chat in the
              bottom-right corner to complete the full demo flow.
            </p>
          </div>

          <div id="live-demo" className="mt-8">
            <StaffingAiDemoShowcase
              companySlug={settings.companySlug}
              companySettings={settings}
            />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(145deg,#0f1c3d,#132654)] px-6 py-8 text-white shadow-[0_30px_90px_-50px_rgba(15,23,42,0.75)] sm:px-8">
            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200/80">
                  Recruiter Value
                </p>
                <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
                  Hirexa AI helps recruiters focus on candidates who are ready to move
                </h2>
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-200">
                  Instead of waiting for incomplete contact forms, staffing teams
                  can use an embedded AI assistant to capture job interest, shift
                  fit, experience, transportation, start timing, pay expectations,
                  and consent in one clean conversation.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <WrenchScrewdriverIcon className="h-5 w-5 text-sky-200" />
                    Faster branch follow-up
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    Recruiters can prioritize who to call or text first instead of
                    manually qualifying every inbound lead.
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <UserGroupIcon className="h-5 w-5 text-sky-200" />
                    Better candidate experience
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    Candidates know what happens next and that a recruiter will
                    review the information before any decision is made.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-600">
              Mock Testimonials
            </p>
            <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Demo quotes for the sales conversation
            </h2>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {testimonials.map((testimonial) => (
              <Card
                key={testimonial.name}
                className="rounded-[1.75rem] border-slate-200 bg-white shadow-[0_18px_50px_-40px_rgba(15,23,42,0.45)]"
              >
                <CardContent className="p-6">
                  <p className="text-base leading-8 text-slate-700">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>
                  <div className="mt-5">
                    <div className="font-semibold text-slate-950">
                      {testimonial.name}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {testimonial.role}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer id="contact" className="bg-[#081328] text-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1.2fr]">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200/80">
                  {column.title}
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-300">
                  {column.links.map((link) => (
                    <li key={link}>{link}</li>
                  ))}
                </ul>
              </div>
            ))}

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200/80">
                Demo disclaimer
              </h3>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                This is a Hirexa AI demo concept. It is not affiliated with,
                endorsed by, or approved by Minutemen Staffing.
              </p>
              <div className="mt-5">
                <Button
                  asChild
                  className="rounded-full text-white hover:opacity-95"
                  style={{ backgroundColor: accentColor }}
                >
                  <Link href="/">Back to Hirexa AI</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function GenericCompanyDemoPage({
  settings,
}: {
  settings: ReturnType<typeof getCompanyChatSettingsBySlug>;
}) {
  const accentColor = getAccentColor(settings.brandPrimaryColor, "#0284c7");
  const locationChips =
    settings.locationCoverage && settings.locationCoverage.length > 0
      ? settings.locationCoverage
      : settings.companyLocation
        ? [settings.companyLocation]
        : ["Hiring region not specified"];

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc,#eef4ff)] pt-20 text-slate-900 sm:pt-24">
      <div className="border-b border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:px-2">
          <span className="font-medium">
            This is a Hirexa AI demo concept built from configurable company chat
            settings.
          </span>
          <span className="text-sky-700/80">Company-configured demo</span>
        </div>
      </div>

      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-[0_18px_45px_-28px_rgba(2,132,199,0.7)]"
              style={{ backgroundColor: accentColor }}
            >
              <BriefcaseIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Company AI Chat Demo
              </div>
              <div className="font-heading text-2xl font-bold tracking-tight text-slate-950">
                {settings.companyName.toUpperCase()}
              </div>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-600">
            <a href="#roles" className="transition hover:text-slate-950">
              Roles
            </a>
            <a href="#industries" className="transition hover:text-slate-950">
              Industries
            </a>
            <a href="#coverage" className="transition hover:text-slate-950">
              Coverage
            </a>
            <a href="#live-demo" className="transition hover:text-slate-950">
              AI Chat Demo
            </a>
          </nav>

          <Button
            asChild
            className="rounded-full px-6 text-white hover:opacity-95"
            style={{ backgroundColor: accentColor }}
          >
            <a href="#live-demo">Preview Chat</a>
          </Button>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <Badge className="border-slate-200 bg-white text-slate-700 shadow-sm">
              Configurable backend settings demo
            </Badge>
            <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              {buildCompanyHeroHeading(settings.companyName, settings.hiringFocus)}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              {settings.companyDescription ||
                "This company-specific demo shows how Hirexa AI can adapt screening and recruiter handoff behavior based on backend settings."}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-full px-6 text-white hover:opacity-95"
                style={{ backgroundColor: accentColor }}
              >
                <a href="#live-demo">AI Chat Demo</a>
              </Button>
              {settings.companyWebsite ? (
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="rounded-full border-slate-300 bg-white px-6 text-slate-900 hover:bg-slate-50"
                >
                  <a href={settings.companyWebsite} target="_blank" rel="noreferrer">
                    Company Website
                    <ArrowRightIcon className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Company
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">
                  {settings.companyIndustry || "Hiring demo"}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {settings.companyLocation || "Location not configured"}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Hiring types
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">
                  {settings.employmentTypes.length}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {settings.employmentTypes.join(", ")}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Pay range
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">
                  {settings.payRange || "Configured by company"}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Screening stays recruiter-reviewed and job-relevant.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center">
            <Card className="w-full rounded-[2rem] border-slate-200 bg-white shadow-[0_32px_120px_-60px_rgba(15,23,42,0.35)]">
              <CardContent className="p-6 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Live company configuration
                    </p>
                    <h2 className="mt-2 font-heading text-2xl font-semibold text-slate-950">
                      {settings.chatDisplayName} for {settings.companyName}
                    </h2>
                  </div>
                  <div
                    className="rounded-2xl p-3 text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    <SparklesIcon className="h-6 w-6" />
                  </div>
                </div>

                <div className="mt-6 grid gap-4">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <ChatBubbleBottomCenterTextIcon className="h-5 w-5 text-sky-700" />
                      Company-aware greeting
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      {settings.welcomeMessage}
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <MapPinIcon className="h-5 w-5 text-sky-700" />
                        Hiring region
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {settings.companyLocation || "Configured on the settings page"}
                      </p>
                    </div>
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <GlobeAltIcon className="h-5 w-5 text-sky-700" />
                        Tone + routing
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {settings.assistantTone || "friendly"} tone, recruiter
                        handoff to {settings.recruiterEmail || "configured recruiter inbox"}.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="roles" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">
                Primary Roles
              </p>
              <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Jobs this company is screening for
              </h2>
            </div>
            <Badge className="border-slate-200 bg-white text-slate-700">
              {settings.employmentTypes.join(" • ")}
            </Badge>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {settings.primaryRoles.map((role) => (
              <Card
                key={role}
                className="rounded-[1.75rem] border-slate-200 bg-white shadow-[0_18px_50px_-40px_rgba(15,23,42,0.45)]"
              >
                <CardContent className="p-6">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    <BriefcaseIcon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-slate-950">{role}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {settings.hiringFocus ||
                      "The AI assistant adapts its follow-up questions around this hiring need."}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="industries" className="border-y border-slate-200 bg-white/80 py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">
                Industries
              </p>
              <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Backend-configured industries and hiring specialties
              </h2>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {settings.industries.map((industry) => (
                <div
                  key={industry}
                  className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-5 text-sm font-semibold text-slate-900 shadow-sm"
                >
                  {industry}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="coverage" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_22px_70px_-50px_rgba(15,23,42,0.35)] sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">
                  Coverage
                </p>
                <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-slate-950">
                  Regional hiring coverage configured from the backend
                </h2>
              </div>
              <Badge className="border-slate-200 bg-white text-slate-700">
                {settings.companyLocation || "Configured location"}
              </Badge>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {locationChips.map((location) => (
                <div
                  key={location}
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  {location}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(145deg,#0f172a,#1e293b)] px-6 py-8 text-white shadow-[0_30px_90px_-50px_rgba(15,23,42,0.75)] sm:px-8">
            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200/80">
                  Recruiter Value
                </p>
                <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
                  Turn company-specific website visitors into recruiter-ready leads
                </h2>
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-200">
                  The AI assistant uses company identity, hiring focus, employment
                  types, shift options, and recruiter routing to tailor how it
                  screens candidates while staying within job-relevant boundaries.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <WrenchScrewdriverIcon className="h-5 w-5 text-sky-200" />
                    Dynamic AI prompt
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    The backend settings drive the greeting, tone, and screening
                    context the AI uses for follow-up questions.
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <UserGroupIcon className="h-5 w-5 text-sky-200" />
                    Recruiter handoff
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    Completed leads include company slug, company name, location,
                    score, tier, and recommended recruiter action.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="live-demo" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">
              Live Demo
            </p>
            <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Embedded AI chat configured for {settings.companyName}
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              This preview uses the company settings provided by the backend AI
              Chat Settings panel. Change the company profile there, save it, and
              reopen this page to see the assistant adapt.
            </p>
          </div>

          <div className="mt-8">
            <StaffingAiDemoShowcase
              companySlug={settings.companySlug}
              companySettings={settings}
            />
          </div>
        </section>
      </main>

      <footer className="bg-[#081328] text-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr_1fr_1.2fr]">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200/80">
                  {column.title}
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-300">
                  {column.links.map((link) => (
                    <li key={link}>{link}</li>
                  ))}
                </ul>
              </div>
            ))}

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200/80">
                Demo disclaimer
              </h3>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                This is a Hirexa AI demo concept driven by backend company chat
                settings. A recruiter still reviews all completed leads before any
                hiring decision is made.
              </p>
              <div className="mt-5">
                <Button
                  asChild
                  className="rounded-full text-white hover:opacity-95"
                  style={{ backgroundColor: accentColor }}
                >
                  <Link href="/">Back to Hirexa AI</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default async function CompanyAiChatDemoPage({
  searchParams,
}: DemoPageProps) {
  const params = (await searchParams) ?? {};
  const requestedSlug =
    typeof params.companySlug === "string" ? params.companySlug : undefined;
  const settings = getCompanyChatSettingsBySlug(requestedSlug);

  if (settings.companySlug === DEFAULT_MINUTEMEN_CHAT_SETTINGS.companySlug) {
    return <MinutemenDemoPage settings={settings} />;
  }

  return <GenericCompanyDemoPage settings={settings} />;
}
