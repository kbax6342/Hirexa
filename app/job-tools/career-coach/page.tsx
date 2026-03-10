import Link from "next/link";
import {
  AcademicCapIcon,
  ArrowTrendingUpIcon,
  BriefcaseIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  RocketLaunchIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import PremiumCareerCoachButton from "./PremiumCareerCoachButton";

type FeatureCard = {
  title: string;
  description: string;
  icon: typeof SparklesIcon;
};

type PlatformCard = {
  title: string;
  description: string;
  href: string;
  icon: typeof SparklesIcon;
};

const featureCards: FeatureCard[] = [
  {
    title: "Personalized Career Strategy",
    description:
      "Build a focused plan around your background, target roles, and next best career moves.",
    icon: SparklesIcon,
  },
  {
    title: "Resume & Profile Optimization",
    description:
      "Turn your existing experience into stronger positioning for recruiters, ATS systems, and hiring managers.",
    icon: DocumentTextIcon,
  },
  {
    title: "Interview Preparation",
    description:
      "Practice stronger responses, sharpen your story, and walk into interviews with clear talking points.",
    icon: AcademicCapIcon,
  },
  {
    title: "Career Growth Guidance",
    description:
      "Get practical recommendations for skills, positioning, and long-term momentum in your search.",
    icon: ArrowTrendingUpIcon,
  },
];

const benefits = [
  "Save Hours of Research",
  "Data-Driven Advice",
  "Built for Job Seekers",
];

const platformCards: PlatformCard[] = [
  {
    title: "Smart Matches",
    description:
      "Use your profile and job interests to surface roles that fit where you want to go next.",
    href: "/dashboard",
    icon: BriefcaseIcon,
  },
  {
    title: "AI Apply",
    description:
      "Pair coaching guidance with tailored application materials for the jobs you want most.",
    href: "/job-tools/generate",
    icon: DocumentTextIcon,
  },
  {
    title: "LinkedIn Outreach",
    description:
      "Extend your search with recruiter outreach that aligns to your goals and target companies.",
    href: "/job-tools/agents/linkedin-outreach",
    icon: ChatBubbleLeftRightIcon,
  },
  {
    title: "HirePilot",
    description:
      "Carry your strategy into interviews with real-time answer support built from your saved profile.",
    href: "/job-tools/agents/hirepilot",
    icon: RocketLaunchIcon,
  },
];

export default async function CareerCoachPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const userProfile = userId
    ? await prisma.userProfile.findUnique({
        where: { userId },
        select: {
          trialPlanStatus: true,
          monthlyPlanStatus: true,
          yearlyPlanStatus: true,
        },
      })
    : null;

  const startHref = session?.user ? "/dashboard" : "/login?callbackUrl=%2Fjob-tools%2Fcareer-coach";
  const uploadHref = "/onboarding/resume";
  const jobMatchesHref = session?.user ? "/dashboard" : "/jobs";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#eff6ff_45%,_#e2e8f0_100%)] pb-16 pt-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="space-y-16">
          <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/90 px-8 py-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur md:px-12 md:py-14">
            <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-blue-100/70 blur-3xl" />
            <div className="absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-sky-100/80 blur-3xl" />

            <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)] lg:items-center">
              <div>
                <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                  Career Coach
                </Badge>
                <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                  Your Personal AI Career Coach
                </h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
                  Get practical AI career guidance tailored to your resume, experience,
                  skills, and target roles so you can make better moves faster.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <PremiumCareerCoachButton
                    activeHref={startHref}
                    className="rounded-xl bg-blue-600 px-6 py-6 text-sm font-semibold text-white hover:bg-blue-700"
                    planStatus={userProfile}
                  >
                    Start Career Coaching
                  </PremiumCareerCoachButton>
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-xl border-slate-300 bg-white px-6 py-6 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Link href={uploadHref}>Upload Resume</Link>
                  </Button>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-3xl border border-blue-100 bg-blue-50/80 p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                      <SparklesIcon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        AI guidance built for momentum
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Combine strategy, application help, interview prep, and outreach in one workflow.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {[
                    "Career planning",
                    "Profile positioning",
                    "Interview confidence",
                  ].map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-700">
                Features
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                Career support across every stage of your search
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Hirexa Career Coach helps you decide what to do next, how to present yourself,
                and how to stay competitive in a crowded market.
              </p>
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {featureCards.map((feature) => {
                const Icon = feature.icon;

                return (
                  <Card
                    key={feature.title}
                    className="border-slate-200 bg-white/90 transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-100/40"
                  >
                    <CardHeader>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                        <Icon className="h-6 w-6" />
                      </div>
                      <CardTitle className="text-xl text-slate-950">
                        {feature.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-sm leading-7 text-slate-600">
                        {feature.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <Card className="border-slate-200 bg-slate-950 text-white shadow-xl shadow-slate-300/20">
              <CardHeader>
                <CardTitle className="text-2xl text-white">Benefits</CardTitle>
                <CardDescription className="text-slate-300">
                  Build a more deliberate job search with guidance that keeps you moving.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {benefits.map((benefit) => (
                  <div
                    key={benefit}
                    className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                  >
                    <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                    <span className="text-sm leading-6 text-slate-100">{benefit}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white/90 shadow-lg shadow-slate-200/50">
              <CardHeader>
                <CardTitle className="text-2xl text-slate-950">
                  Platform Integration
                </CardTitle>
                <CardDescription className="text-slate-600">
                  Career Coach fits directly into the rest of Hirexa so advice turns into action.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {platformCards.map((platform) => {
                  const Icon = platform.icon;

                  return (
                    <Link
                      key={platform.title}
                      href={platform.href}
                      className="group rounded-2xl border border-slate-200 bg-slate-50 p-5 transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:bg-white hover:shadow-lg hover:shadow-blue-100/40"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200 transition group-hover:ring-blue-200">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-slate-950">
                        {platform.title}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        {platform.description}
                      </p>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white/90 px-8 py-10 text-center shadow-[0_16px_48px_rgba(15,23,42,0.08)] backdrop-blur md:px-12">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-700">
              Next Step
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Ready to Take Control of Your Career?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Use Hirexa to sharpen your positioning, find the right roles faster, and move through
              applications and interviews with more confidence.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <PremiumCareerCoachButton
                activeHref={startHref}
                className="rounded-xl bg-blue-600 px-6 py-6 text-sm font-semibold text-white hover:bg-blue-700"
                planStatus={userProfile}
              >
                Start Coaching
              </PremiumCareerCoachButton>
              <Button
                asChild
                variant="outline"
                className="rounded-xl border-slate-300 bg-white px-6 py-6 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Link href={jobMatchesHref}>View Job Matches</Link>
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
