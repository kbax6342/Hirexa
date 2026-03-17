"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ComponentType,
  type FormEvent,
  type ReactNode,
  type SVGProps,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AcademicCapIcon,
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  BriefcaseIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  LightBulbIcon,
  MapPinIcon,
  RocketLaunchIcon,
  SparklesIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

export type CareerCoachFormState = {
  targetRoles: string;
  targetIndustry: string;
  preferredLocation: string;
  experienceLevel: string;
  biggestChallenge: string;
  priority: string;
  additionalContext: string;
};

export type CareerCoachProfileSummary = {
  firstName: string | null;
  fullName: string | null;
  roleFocus: string | null;
  preferredLocation: string | null;
  skills: string[];
  experienceCount: number;
  experiences: Array<{ title: string; company: string; dateRange: string | null }>;
  resumeAvailable: boolean;
  resumeFileName: string | null;
  resumeUpdatedAt: string | null;
  profileSignals: number;
};

type CareerCoachPlan = {
  summary: string;
  whyThisAdvice: string;
  actionPlan: string[];
  nextMoves: string[];
  resumeAdvice: string[];
  interviewTalkingPoints: string[];
  outreachAdvice: string[];
  skillsToBuild: string[];
  risks: string[];
  quickWins: string[];
};

type CareerCoachClientProps = {
  isAuthenticated: boolean;
  hasPaidAccess: boolean;
  loginHref: string;
  checkoutHref: string;
  uploadHref: string;
  jobMatchesHref: string;
  aiApplyHref: string;
  linkedInOutreachHref: string;
  hirePilotHref: string;
  initialForm: CareerCoachFormState;
  profileSummary: CareerCoachProfileSummary | null;
};

type ProviderResponse = {
  ok?: boolean;
  error?: string;
  plan?: CareerCoachPlan;
};

const experienceOptions = [
  "Entry level",
  "Early career",
  "Mid level",
  "Senior level",
  "Manager / lead",
  "Executive",
] as const;

const challengeOptions = [
  "Getting more interviews",
  "Clarifying my target role",
  "Strengthening my resume",
  "Improving interview confidence",
  "Building a better networking strategy",
  "Positioning for a career pivot",
] as const;

const priorityOptions = [
  "Land interviews faster",
  "Refine my personal brand",
  "Build a stronger outreach plan",
  "Prepare for upcoming interviews",
  "Close skill gaps for target roles",
] as const;

export default function CareerCoachClient({
  isAuthenticated,
  hasPaidAccess,
  loginHref,
  checkoutHref,
  uploadHref,
  jobMatchesHref,
  aiApplyHref,
  linkedInOutreachHref,
  hirePilotHref,
  initialForm,
  profileSummary,
}: CareerCoachClientProps) {
  const router = useRouter();
  const intakeRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState(initialForm);
  const [plan, setPlan] = useState<CareerCoachPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heroStatus = useMemo(() => {
    if (!isAuthenticated) return "Sign in to personalize this plan";
    if (!hasPaidAccess) return "Upgrade to unlock AI-generated coaching";
    return "Ready to generate a tailored career plan";
  }, [hasPaidAccess, isAuthenticated]);

  const contextRows = [
    {
      title: profileSummary?.resumeAvailable ? "Resume available" : "Resume not uploaded yet",
      description: profileSummary?.resumeAvailable
        ? profileSummary.resumeFileName || "Uploaded resume available for coaching context."
        : "You can continue with profile-only coaching and upload a resume later.",
      icon: DocumentTextIcon,
      tone: profileSummary?.resumeAvailable ? "positive" : "warning",
    },
    {
      title:
        profileSummary?.profileSignals && profileSummary.profileSignals >= 3
          ? "Profile context looks strong"
          : "Profile context is partial",
      description:
        [profileSummary?.fullName, profileSummary?.roleFocus, profileSummary?.preferredLocation]
          .filter(Boolean)
          .join(" | ") || "Add target roles, location, or profile details for sharper advice.",
      icon: UserCircleIcon,
      tone:
        profileSummary?.profileSignals && profileSummary.profileSignals >= 3
          ? "positive"
          : "neutral",
    },
    {
      title: profileSummary?.experienceCount
        ? `${profileSummary.experienceCount} experience entr${
            profileSummary.experienceCount === 1 ? "y" : "ies"
          } detected`
        : "Experience history is light",
      description: profileSummary?.experiences.length
        ? profileSummary.experiences.map((item) => `${item.title} at ${item.company}`).join(" | ")
        : profileSummary?.skills.length
          ? `${profileSummary.skills.length} saved skills available for guidance.`
          : "Career Coach can still give practical advice from your intake answers.",
      icon: BriefcaseIcon,
      tone: profileSummary?.experienceCount ? "positive" : "neutral",
    },
  ] as const;

  const resultSections = plan
    ? [
        {
          title: "Best next moves this week",
          icon: ArrowTrendingUpIcon,
          items: plan.nextMoves,
        },
        {
          title: "Resume positioning advice",
          icon: DocumentTextIcon,
          items: plan.resumeAdvice,
        },
        {
          title: "Interview talking points",
          icon: AcademicCapIcon,
          items: plan.interviewTalkingPoints,
        },
        {
          title: "Recruiter / outreach guidance",
          icon: ChatBubbleLeftRightIcon,
          items: plan.outreachAdvice,
        },
        {
          title: "Skills or projects to prioritize",
          icon: RocketLaunchIcon,
          items: plan.skillsToBuild,
        },
        {
          title: "Confidence boosters / quick wins",
          icon: CheckCircleIcon,
          items: plan.quickWins,
        },
      ]
    : [];

  function handleStartCoaching() {
    if (!isAuthenticated) {
      router.push(loginHref);
      return;
    }

    intakeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateField<Key extends keyof CareerCoachFormState>(
    key: Key,
    value: CareerCoachFormState[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleGeneratePlan(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (loading) return;

    if (!isAuthenticated) {
      router.push(loginHref);
      return;
    }

    if (!hasPaidAccess) {
      router.push(checkoutHref);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agents/career-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (response.status === 401) {
        router.push(loginHref);
        return;
      }

      if (response.status === 403) {
        router.push(checkoutHref);
        return;
      }

      const data = (await response.json().catch(() => null)) as ProviderResponse | null;
      if (!response.ok || data?.ok === false || !data?.plan) {
        throw new Error(data?.error || "We couldn't generate a career plan right now.");
      }

      setPlan(data.plan);
      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "We couldn't generate a career plan right now."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#eff6ff_45%,_#e2e8f0_100%)] pb-16 pt-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="space-y-10">
          <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/90 px-8 py-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur md:px-12 md:py-14">
            <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-blue-100/70 blur-3xl" />
            <div className="absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-sky-100/80 blur-3xl" />
            <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:items-center">
              <div>
                <Badge className="bg-blue-600 text-white hover:bg-blue-600">Career Coach</Badge>
                <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                  Your Personal AI Career Coach
                </h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
                  Get practical AI career guidance tailored to your resume, experience,
                  skills, and target roles so you can make better moves faster.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={handleStartCoaching}
                    className="rounded-xl bg-blue-600 px-6 py-6 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Start Career Coaching
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-xl border-slate-300 bg-white px-6 py-6 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Link href={uploadHref}>Upload Resume</Link>
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    className="rounded-xl px-6 py-6 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Link href={jobMatchesHref}>View Job Matches</Link>
                  </Button>
                </div>
              </div>
              <div className="grid gap-4">
                <div className="rounded-3xl border border-blue-100 bg-blue-50/80 p-6 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                      <SparklesIcon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Real coaching, not just a landing page
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Build a focused plan from your profile, resume context, and current job-search priorities.
                      </p>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                        {heroStatus}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {[
                    profileSummary?.resumeAvailable
                      ? "Resume context ready"
                      : "Profile-only coaching available",
                    plan ? "Structured advice generated" : "Action plan included",
                    "Integrated with Hirexa tools",
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
          <div
            ref={intakeRef}
            className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]"
          >
            <Card className="rounded-[2rem] border-slate-200 bg-white/90 shadow-lg shadow-slate-200/50">
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl text-slate-950">Coaching intake</CardTitle>
                <CardDescription className="text-sm leading-7 text-slate-600">
                  Tell Hirexa where you want to go next and what is getting in the way.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={(event) => void handleGeneratePlan(event)}>
                  <Field
                    label="Target role(s)"
                    value={form.targetRoles}
                    onChange={(value) => updateField("targetRoles", value)}
                    placeholder="Product manager, customer success manager, software engineer..."
                  />
                  <Field
                    label="Target industry or companies"
                    value={form.targetIndustry}
                    onChange={(value) => updateField("targetIndustry", value)}
                    placeholder="Fintech, healthcare startups, mission-driven teams..."
                  />
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field
                      label="Preferred location"
                      value={form.preferredLocation}
                      onChange={(value) => updateField("preferredLocation", value)}
                      placeholder="Chicago, IL or Remote"
                      icon={<MapPinIcon className="h-4 w-4 text-slate-400" />}
                    />
                    <SelectField
                      label="Experience level"
                      value={form.experienceLevel}
                      onChange={(value) => updateField("experienceLevel", value)}
                      placeholder="Select experience level"
                      options={experienceOptions}
                    />
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <SelectField
                      label="Biggest current challenge"
                      value={form.biggestChallenge}
                      onChange={(value) => updateField("biggestChallenge", value)}
                      placeholder="Select a challenge"
                      options={challengeOptions}
                    />
                    <SelectField
                      label="Job search priority right now"
                      value={form.priority}
                      onChange={(value) => updateField("priority", value)}
                      placeholder="Select a priority"
                      options={priorityOptions}
                    />
                  </div>
                  <Field
                    label="Optional context"
                    value={form.additionalContext}
                    onChange={(value) => updateField("additionalContext", value)}
                    placeholder="Anything else the coach should know about your goals, timeline, or pivot?"
                    multiline
                    rows={5}
                  />
                  {error ? <InlineNotice>{error}</InlineNotice> : null}
                  <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-500">
                      {profileSummary?.resumeAvailable
                        ? "Your coaching plan will incorporate profile and resume context."
                        : "No resume is required. Hirexa can still coach from your profile and form inputs."}
                    </p>
                    <Button
                      type="submit"
                      disabled={loading}
                      className="rounded-xl bg-blue-600 px-5 py-5 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      {loading ? (
                        <>
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <SparklesIcon className="h-4 w-4" />
                          Generate My Career Plan
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="rounded-[2rem] border-slate-200 bg-white/90 shadow-lg shadow-slate-200/50">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl text-slate-950">
                    Resume and profile context
                  </CardTitle>
                  <CardDescription className="text-sm leading-7 text-slate-600">
                    Career Coach works with whatever context is available today.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {contextRows.map((row) => (
                    <StatusRow key={row.title} {...row} />
                  ))}
                  {!profileSummary?.resumeAvailable ? (
                    <Button asChild variant="outline" className="w-full rounded-xl border-slate-300">
                      <Link href={uploadHref}>Upload Resume</Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="rounded-[2rem] border-slate-200 bg-slate-950 text-white shadow-xl shadow-slate-300/20">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl text-white">What you'll get</CardTitle>
                  <CardDescription className="text-slate-300">
                    Advice that is structured to turn into next actions, not just generic inspiration.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    "Career strategy summary",
                    "Resume positioning advice",
                    "Interview talking points",
                    "A practical action plan for this week",
                  ].map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-6 text-slate-100"
                    >
                      {item}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          <section ref={resultsRef} className="space-y-6">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-700">
                Coaching Results
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                Advice that turns into action
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Generate a plan when you're ready. Hirexa will organize your next moves across positioning, interviews, outreach, and skills.
              </p>
            </div>

            {loading ? <LoadingState /> : null}

            {!loading && !plan ? (
              <Card className="rounded-[2rem] border-dashed border-slate-300 bg-white/80">
                <CardContent className="flex flex-col gap-4 p-8 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-950">
                      No coaching plan generated yet
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                      Use the intake above to generate a career strategy summary, weekly action plan, interview themes, outreach guidance, and quick wins tailored to your background.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleStartCoaching}
                    className="rounded-xl bg-blue-600 px-5 py-5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Start Career Coaching
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {!loading && plan ? (
              <>
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
                  <Card className="rounded-[2rem] border-slate-200 bg-white/90 shadow-lg shadow-slate-200/50">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-2xl text-slate-950">
                        Career strategy summary
                      </CardTitle>
                      <CardDescription className="text-sm leading-7 text-slate-600">
                        The big picture Hirexa wants you to act on first.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm leading-7 text-slate-700">{plan.summary}</p>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <LightBulbIcon className="h-5 w-5 text-amber-500" />
                          Why this advice
                        </div>
                        <p className="mt-2 text-sm leading-7 text-slate-600">
                          {plan.whyThisAdvice}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-[2rem] border-slate-200 bg-slate-950 text-white shadow-xl shadow-slate-300/20">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-2xl text-white">Action plan</CardTitle>
                      <CardDescription className="text-slate-300">
                        Your 5-7 concrete next steps.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {plan.actionPlan.map((step, index) => (
                        <div
                          key={`${index}-${step}`}
                          className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                        >
                          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-semibold text-white">
                            {index + 1}
                          </span>
                          <span className="text-sm leading-6 text-slate-100">{step}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {resultSections.map((section) => (
                    <ResultCard key={section.title} {...section} />
                  ))}
                </div>

                <Card className="rounded-[2rem] border-amber-200 bg-amber-50/80 shadow-lg shadow-amber-100/40">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                      <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
                      Top risks / gaps holding you back
                    </CardTitle>
                    <CardDescription className="text-sm leading-7 text-slate-600">
                      The friction points to address before they slow your search down further.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {plan.risks.map((risk, index) => (
                        <li
                          key={`${index}-${risk}`}
                          className="rounded-2xl border border-amber-200 bg-white px-4 py-4 text-sm leading-6 text-slate-700"
                        >
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="rounded-[2rem] border-slate-200 bg-white/90 shadow-lg shadow-slate-200/50">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-2xl text-slate-950">
                      Turn this plan into progress
                    </CardTitle>
                    <CardDescription className="text-sm leading-7 text-slate-600">
                      Jump directly into other Hirexa workflows from here.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-3">
                    <Button asChild className="rounded-xl bg-blue-600 text-white hover:bg-blue-700">
                      <Link href={jobMatchesHref}>View Job Matches</Link>
                    </Button>
                    <Button asChild variant="outline" className="rounded-xl border-slate-300">
                      <Link href={aiApplyHref}>Go to AI Apply</Link>
                    </Button>
                    <Button asChild variant="outline" className="rounded-xl border-slate-300">
                      <Link href={linkedInOutreachHref}>Go to LinkedIn Outreach</Link>
                    </Button>
                    <Button asChild variant="outline" className="rounded-xl border-slate-300">
                      <Link href={hirePilotHref}>Go to HirePilot</Link>
                    </Button>
                    {!profileSummary?.resumeAvailable ? (
                      <Button asChild variant="ghost" className="rounded-xl">
                        <Link href={uploadHref}>Upload Resume</Link>
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <Card className="rounded-[2rem] border-slate-200 bg-slate-950 text-white shadow-xl shadow-slate-300/20">
              <CardHeader>
                <CardTitle className="text-2xl text-white">Platform integration</CardTitle>
                <CardDescription className="text-slate-300">
                  Career Coach fits directly into the rest of Hirexa so advice turns into action.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  "Smart Matches for aligned job discovery",
                  "AI Apply for tailored application materials",
                  "LinkedIn Outreach for recruiter momentum",
                  "HirePilot for interview support",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-6 text-slate-100"
                  >
                    {item}
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="rounded-[2rem] border-slate-200 bg-white/90 shadow-lg shadow-slate-200/50">
              <CardHeader>
                <CardTitle className="text-2xl text-slate-950">
                  Ready to Take Control of Your Career?
                </CardTitle>
                <CardDescription className="text-slate-600">
                  Use Hirexa to sharpen your positioning, find better-fit roles faster, and move through applications and interviews with more confidence.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={handleStartCoaching}
                  className="rounded-xl bg-blue-600 px-5 py-5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Start Coaching
                </Button>
                <Button asChild variant="outline" className="rounded-xl border-slate-300">
                  <Link href={jobMatchesHref}>View Job Matches</Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 3,
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  icon?: ReactNode;
}) {
  const baseClassName =
    "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300";

  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {multiline ? (
        <textarea
          className={baseClassName}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div className="relative mt-2">
          {icon ? <div className="pointer-events-none absolute left-4 top-3.5">{icon}</div> : null}
          <input
            className={`${baseClassName} ${icon ? "pl-11" : ""}`}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      )}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  placeholder,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: readonly string[];
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusRow({
  icon: Icon,
  title,
  description,
  tone,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  tone: "positive" | "neutral" | "warning";
}) {
  const toneClassName =
    tone === "positive"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-slate-50";

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClassName}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 text-blue-600" />
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  items: string[];
}) {
  return (
    <Card className="rounded-[2rem] border-slate-200 bg-white/90 shadow-lg shadow-slate-200/50">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
          <Icon className="h-5 w-5 text-blue-600" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li
              key={`${index}-${item}`}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
            >
              <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              <span className="text-sm leading-6 text-slate-700">{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card
          key={index}
          className="rounded-[2rem] border-slate-200 bg-white/90 shadow-lg shadow-slate-200/50"
        >
          <CardHeader className="pb-4">
            <div className="h-5 w-36 animate-pulse rounded-full bg-slate-200" />
            <div className="h-4 w-24 animate-pulse rounded-full bg-slate-100" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((__, lineIndex) => (
              <div
                key={lineIndex}
                className="h-16 animate-pulse rounded-2xl border border-slate-200 bg-slate-50"
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function InlineNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {children}
    </div>
  );
}
