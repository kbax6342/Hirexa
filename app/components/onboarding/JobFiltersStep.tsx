"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  BriefcaseIcon,
  CheckIcon,
  ClockIcon,
  CurrencyDollarIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import {
  type CompensationType,
  SALARY_BOUNDS,
  clampSalaryForType,
  formatSalary,
  parseSalaryInputToNumber,
} from "@/app/lib/salary";
import { cn } from "@/app/lib/utils";
import {
  HIGHLIGHT_SKILLS_ROUTE,
  HIREXA_SUPPORT_ROUTE,
  JOB_FILTERS_ROUTE,
  getNextOnboardingRoute,
  getPreviousOnboardingRoute,
} from "@/app/lib/onboarding-flow";

const WORK_SETUP_OPTIONS = [
  "Remote only",
  "Hybrid",
  "On-site",
  "Open to anything",
] as const;
const COMMUTE_OPTIONS = [
  "0-10 miles",
  "10-25 miles",
  "25-40 miles",
  "40+ miles",
  "25+ miles",
  "I only want remote",
] as const;
const SCHEDULE_OPTIONS = [
  "Full-time",
  "Part-time",
  "Contract",
  "Flexible",
  "Shift-based",
  "Day shift",
  "Project-based",
  "Consistent weekday hours",
  "Overtime available",
] as const;
const PAY_OPTIONS = ["$15+", "$20+", "$25+", "$35+", "$50+", "Custom"] as const;
const PAY_OPTION_VALUES: Record<(typeof PAY_OPTIONS)[number], number | null> = {
  "$15+": 15,
  "$20+": 20,
  "$25+": 25,
  "$35+": 35,
  "$50+": 50,
  Custom: null,
};
const QUESTION_CARD_COUNT = 4;
const TOTAL_CARD_STATES = 5;
const CUSTOM_PAY_OPTION = "Custom";

type WorkSetupOption = (typeof WORK_SETUP_OPTIONS)[number];
type CommuteOption = (typeof COMMUTE_OPTIONS)[number];
type ScheduleOption = (typeof SCHEDULE_OPTIONS)[number];
type PayOption = (typeof PAY_OPTIONS)[number];
type MotionPhase = "idle" | "exit" | "enter";

type FilterAnswers = {
  workSetup: WorkSetupOption | "";
  commute: CommuteOption | "";
  schedules: ScheduleOption[];
  paySelection: PayOption | "";
  customPay: string;
};

type PreferencesResponse = {
  ok?: boolean;
  preferences?: {
    minCompensation?: number | null;
    compensationType?: CompensationType;
    roleFocus?: string;
    workSetup?: string;
    commutePreference?: string;
    schedulePreferences?: string[];
    jobFilterPaySelection?: string;
  };
  error?: string;
};

const DEFAULT_ANSWERS: FilterAnswers = {
  workSetup: "",
  commute: "",
  schedules: [],
  paySelection: "",
  customPay: "",
};

const CARD_META = [
  {
    key: "workSetup" as const,
    question: "What work setup are you open to?",
    helper: "We'll use this to avoid roles that don't fit your lifestyle.",
    forwardLabel: "Set my work style",
    backLabel: "Back to skills",
    options: WORK_SETUP_OPTIONS,
    layout: "list" as const,
  },
  {
    key: "commute" as const,
    question: "How far are you willing to commute?",
    helper: "No point showing jobs you'd never realistically travel to.",
    forwardLabel: "Narrow the map",
    backLabel: "Change that",
    options: COMMUTE_OPTIONS,
    layout: "list" as const,
  },
  {
    key: "schedule" as const,
    question: "What schedule works for you?",
    helper: "This helps us match your real availability, not just job titles.",
    forwardLabel: "Build my schedule",
    backLabel: "Go back",
    options: SCHEDULE_OPTIONS,
    layout: "list" as const,
  },
  {
    key: "pay" as const,
    question: "What pay range would make this worth it?",
    helper: "We'll prioritize jobs that match your expectations.",
    forwardLabel: "Show me worth-it jobs",
    backLabel: "Edit last choice",
    options: PAY_OPTIONS,
    layout: "chips" as const,
  },
  {
    key: "summary" as const,
    question: "Perfect - now Hirexa knows what to filter out.",
    helper: "",
    forwardLabel: "Find me real matches",
    backLabel: "Adjust filters",
    options: [] as const,
    layout: "summary" as const,
  },
] as const;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function getWorkSetupOptionsForRole(roleFocus: string): WorkSetupOption[] {
  const normalizedRole = normalizeText(roleFocus).toLowerCase();

  if (!normalizedRole) {
    return [...WORK_SETUP_OPTIONS];
  }

  const prioritize = (...prioritized: WorkSetupOption[]) => {
    const seen = new Set<WorkSetupOption>();
    return [...prioritized, ...WORK_SETUP_OPTIONS].filter((option) => {
      if (seen.has(option)) return false;
      seen.add(option);
      return true;
    });
  };

  if (
    /(software|engineer|developer|frontend|backend|full stack|data|analyst|designer|product|marketing|office|administrative|assistant|manager|accountant|coordinator)/.test(
      normalizedRole
    )
  ) {
    return prioritize("Remote only", "Hybrid", "Open to anything", "On-site");
  }

  if (
    /(customer support|customer service|support|call center|help desk)/.test(
      normalizedRole
    )
  ) {
    return prioritize("Remote only", "Hybrid", "On-site", "Open to anything");
  }

  if (
    /(warehouse|logistics|delivery|driver|forklift|stock|inventory|fulfillment|manufacturing|picker|packer|electrician|plumber|hvac|maintenance|mechanic|construction|technician|installer|welder|carpenter|trade|barista|cashier|server|host|crew|restaurant|food|hospitality|retail|associate)/.test(
      normalizedRole
    )
  ) {
    return ["On-site", "Open to anything"];
  }

  if (
    /(nurse|medical|healthcare|cna|caregiver|patient|phlebotom|dental|clinic|hospital)/.test(
      normalizedRole
    )
  ) {
    return prioritize("On-site", "Open to anything", "Hybrid", "Remote only");
  }

  return [...WORK_SETUP_OPTIONS];
}

function getCommuteOptionsForRole(roleFocus: string): CommuteOption[] {
  const normalizedRole = normalizeText(roleFocus).toLowerCase();

  if (!normalizedRole) {
    return ["0-10 miles", "10-25 miles", "25+ miles", "I only want remote"];
  }

  if (
    /(software|engineer|developer|frontend|backend|full stack|data|analyst|designer|product|marketing|office|administrative|assistant|manager|accountant|coordinator|customer support|customer service|support|call center|help desk)/.test(
      normalizedRole
    )
  ) {
    return ["0-10 miles", "10-25 miles", "25+ miles", "I only want remote"];
  }

  if (
    /(warehouse|logistics|delivery|driver|forklift|stock|inventory|fulfillment|manufacturing|picker|packer|electrician|plumber|hvac|maintenance|mechanic|construction|technician|installer|welder|carpenter|trade|barista|cashier|server|host|crew|restaurant|food|hospitality|retail|associate|nurse|medical|healthcare|cna|caregiver|patient|phlebotom|dental|clinic|hospital)/.test(
      normalizedRole
    )
  ) {
    return ["0-10 miles", "10-25 miles", "25-40 miles", "40+ miles"];
  }

  return ["0-10 miles", "10-25 miles", "25+ miles", "I only want remote"];
}

function getScheduleOptionsForRole(roleFocus: string): ScheduleOption[] {
  const normalizedRole = normalizeText(roleFocus).toLowerCase();

  if (!normalizedRole) {
    return ["Full-time", "Part-time", "Contract", "Flexible"];
  }

  if (
    /(software|engineer|developer|frontend|backend|full stack|data|analyst|designer|product|marketing|office|administrative|assistant|manager|accountant|coordinator)/.test(
      normalizedRole
    )
  ) {
    return ["Full-time", "Contract", "Flexible", "Part-time"];
  }

  if (
    /(warehouse|logistics|delivery|driver|forklift|stock|inventory|fulfillment|manufacturing|picker|packer)/.test(
      normalizedRole
    )
  ) {
    return ["Full-time", "Shift-based", "Overtime available", "Contract"];
  }

  if (
    /(nurse|medical|healthcare|cna|caregiver|patient|phlebotom|dental|clinic|hospital)/.test(
      normalizedRole
    )
  ) {
    return ["Full-time", "Part-time", "Shift-based", "Flexible"];
  }

  if (
    /(electrician|plumber|hvac|maintenance|mechanic|construction|technician|installer|welder|carpenter|trade)/.test(
      normalizedRole
    )
  ) {
    return ["Full-time", "Contract", "Project-based", "Day shift"];
  }

  if (
    /(customer support|customer service|support|retail|barista|cashier|server|host|crew|restaurant|food|hospitality|sales|associate)/.test(
      normalizedRole
    )
  ) {
    return ["Part-time", "Flexible", "Full-time", "Shift-based"];
  }

  return ["Full-time", "Part-time", "Contract", "Flexible"];
}

function isWorkSetupOption(value: string): value is WorkSetupOption {
  return WORK_SETUP_OPTIONS.includes(value as WorkSetupOption);
}

function isCommuteOption(value: string): value is CommuteOption {
  return COMMUTE_OPTIONS.includes(value as CommuteOption);
}

function isScheduleOption(value: string): value is ScheduleOption {
  return SCHEDULE_OPTIONS.includes(value as ScheduleOption);
}

function isPayOption(value: string): value is PayOption {
  return PAY_OPTIONS.includes(value as PayOption);
}

function getSavedAnswers(
  data: PreferencesResponse["preferences"] | undefined
): FilterAnswers {
  if (!data) return DEFAULT_ANSWERS;

  const savedWorkSetup = normalizeText(data.workSetup);
  const savedCommute = normalizeText(data.commutePreference);
  const paySelection = normalizeText(data.jobFilterPaySelection);
  const minComp =
    typeof data.minCompensation === "number" &&
    data.compensationType === "hourly"
      ? data.minCompensation
      : null;

  return {
    workSetup: isWorkSetupOption(savedWorkSetup) ? savedWorkSetup : "",
    commute: isCommuteOption(savedCommute) ? savedCommute : "",
    schedules: Array.isArray(data.schedulePreferences)
      ? data.schedulePreferences
          .map((item) => normalizeText(item))
          .filter(isScheduleOption)
      : [],
    paySelection: isPayOption(paySelection) ? paySelection : "",
    customPay:
      paySelection === CUSTOM_PAY_OPTION && minComp !== null
        ? String(minComp)
        : "",
  };
}

function getMotionClass(phase: MotionPhase, direction: 1 | -1) {
  if (phase === "exit") {
    return direction === 1
      ? "-translate-x-8 opacity-0"
      : "translate-x-8 opacity-0";
  }

  if (phase === "enter") {
    return direction === 1
      ? "translate-x-8 opacity-0"
      : "-translate-x-8 opacity-0";
  }

  return "translate-x-0 opacity-100";
}

export default function JobFiltersStep() {
  const router = useRouter();
  const [answers, setAnswers] = useState<FilterAnswers>(DEFAULT_ANSWERS);
  const [targetRole, setTargetRole] = useState("");
  const [loadingSavedState, setLoadingSavedState] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [pendingCardIndex, setPendingCardIndex] = useState<number | null>(null);
  const [motionPhase, setMotionPhase] = useState<MotionPhase>("idle");
  const [motionDirection, setMotionDirection] = useState<1 | -1>(1);

  const card = CARD_META[cardIndex];
  const visualCardIndex = pendingCardIndex ?? cardIndex;
  const progressPercent = useMemo(
    () =>
      Math.max(
        8,
        Math.round(((visualCardIndex + 1) / TOTAL_CARD_STATES) * 100)
      ),
    [visualCardIndex]
  );
  const customPayValue = parseSalaryInputToNumber(answers.customPay);
  const workSetupOptions = useMemo(
    () => getWorkSetupOptionsForRole(targetRole),
    [targetRole]
  );
  const commuteOptions = useMemo(
    () => getCommuteOptionsForRole(targetRole),
    [targetRole]
  );
  const scheduleOptions = useMemo(
    () => getScheduleOptionsForRole(targetRole),
    [targetRole]
  );
  const resolvedPayValue = useMemo(() => {
    if (!answers.paySelection) return null;
    if (answers.paySelection === CUSTOM_PAY_OPTION) {
      return customPayValue === null
        ? null
        : clampSalaryForType(customPayValue, "hourly");
    }
    return PAY_OPTION_VALUES[answers.paySelection];
  }, [answers.paySelection, customPayValue]);
  const currentStepValid = useMemo(() => {
    switch (card.key) {
      case "workSetup":
        return Boolean(answers.workSetup);
      case "commute":
        return Boolean(answers.commute);
      case "schedule":
        return answers.schedules.length > 0;
      case "pay":
        return Boolean(answers.paySelection) && resolvedPayValue !== null;
      default:
        return true;
    }
  }, [answers.commute, answers.paySelection, answers.schedules.length, answers.workSetup, card.key, resolvedPayValue]);

  useEffect(() => {
    let active = true;

    async function loadSavedState() {
      try {
        const response = await fetch("/api/profile/preferences", {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await response.json().catch(() => null)) as
          | PreferencesResponse
          | null;

        if (active && response.ok && data?.preferences) {
          setTargetRole(normalizeText(data.preferences.roleFocus));
          setAnswers(getSavedAnswers(data.preferences));
        }
      } finally {
        if (active) setLoadingSavedState(false);
      }
    }

    void loadSavedState();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (motionPhase !== "exit" || pendingCardIndex === null) return;
    const timer = window.setTimeout(() => {
      setCardIndex(pendingCardIndex);
      setMotionPhase("enter");
    }, 200);
    return () => window.clearTimeout(timer);
  }, [motionPhase, pendingCardIndex]);

  useEffect(() => {
    if (motionPhase !== "enter") return;
    const frame = window.requestAnimationFrame(() => {
      setMotionPhase("idle");
      setPendingCardIndex(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [motionPhase]);

  useEffect(() => {
    setAnswers((current) =>
      current.workSetup && !workSetupOptions.includes(current.workSetup)
        ? { ...current, workSetup: "" }
        : current
    );
  }, [workSetupOptions]);

  useEffect(() => {
    setAnswers((current) =>
      current.commute && !commuteOptions.includes(current.commute)
        ? { ...current, commute: "" }
        : current
    );
  }, [commuteOptions]);

  useEffect(() => {
    setAnswers((current) => {
      const nextSchedules = current.schedules.filter((schedule) =>
        scheduleOptions.includes(schedule)
      );
      return nextSchedules.length === current.schedules.length
        ? current
        : { ...current, schedules: nextSchedules };
    });
  }, [scheduleOptions]);

  function transitionTo(nextIndex: number, direction: 1 | -1) {
    if (motionPhase !== "idle" || nextIndex === cardIndex) return;
    setError(null);
    setMotionDirection(direction);
    setPendingCardIndex(nextIndex);
    setMotionPhase("exit");
  }

  function handleSingleSelect(field: "workSetup" | "commute", value: string) {
    setError(null);
    setAnswers((current) => ({
      ...current,
      [field]: current[field] === value ? "" : value,
    }));
  }

  function handleScheduleToggle(value: ScheduleOption) {
    setError(null);
    setAnswers((current) => ({
      ...current,
      schedules: current.schedules.includes(value)
        ? current.schedules.filter((item) => item !== value)
        : [...current.schedules, value],
    }));
  }

  function handlePaySelect(value: PayOption) {
    setError(null);
    setAnswers((current) => ({
      ...current,
      paySelection: value,
      customPay: value === CUSTOM_PAY_OPTION ? current.customPay : "",
    }));
  }

  function handleBack() {
    if (card.key === "summary") {
      transitionTo(0, -1);
      return;
    }

    if (cardIndex === 0) {
      router.push(
        getPreviousOnboardingRoute(JOB_FILTERS_ROUTE) ?? HIGHLIGHT_SKILLS_ROUTE
      );
      return;
    }

    transitionTo(cardIndex - 1, -1);
  }

  function handleRestart() {
    if (motionPhase !== "idle") return;

    setError(null);
    setAnswers(DEFAULT_ANSWERS);
    setMotionDirection(-1);
    setPendingCardIndex(0);
    setMotionPhase("exit");
  }

  async function handleFinish() {
    if (resolvedPayValue === null) return;

    setSaving(true);
    setError(null);

    const forceRemoteOnly =
      answers.workSetup === "Remote only" ||
      answers.commute === "I only want remote";
    const includeRemote =
      forceRemoteOnly ||
      answers.workSetup === "Hybrid" ||
      answers.workSetup === "Open to anything";

    try {
      const response = await fetch("/api/profile/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          includeRemote,
          ...(forceRemoteOnly ? { workplaceLocations: null } : {}),
          compensationType: "hourly",
          minCompensation: resolvedPayValue,
          employmentType:
            answers.schedules.find((item) =>
              ["Full-time", "Part-time", "Contract", "Temporary"].includes(item)
            ) ?? undefined,
          workSetup: answers.workSetup,
          commutePreference: answers.commute,
          schedulePreferences: answers.schedules,
          jobFilterPaySelection: answers.paySelection,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "We could not save your filters yet.");
      }

      router.push(
        getNextOnboardingRoute(JOB_FILTERS_ROUTE) ?? HIREXA_SUPPORT_ROUTE
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not save your filters yet."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleForward() {
    if (!currentStepValid) return;
    if (card.key === "summary") {
      void handleFinish();
      return;
    }
    transitionTo(cardIndex + 1, 1);
  }

  const summaryItems = useMemo(
    () => [
      {
        label: "Work setup",
        value:
          answers.commute === "I only want remote"
            ? "Remote only"
            : answers.workSetup || "Not set",
        icon: BriefcaseIcon,
      },
      { label: "Commute", value: answers.commute || "Not set", icon: MapPinIcon },
      {
        label: "Schedule",
        value: answers.schedules.length
          ? answers.schedules.join(", ")
          : "Not set",
        icon: ClockIcon,
      },
      {
        label: "Pay",
        value:
          resolvedPayValue === null
            ? "Not set"
            : `At least ${formatSalary(resolvedPayValue, "hourly")}`,
        icon: CurrencyDollarIcon,
      },
    ],
    [answers.commute, answers.schedules, answers.workSetup, resolvedPayValue]
  );

  function renderOptionButton(option: string, isSelected: boolean, onClick: () => void) {
    return (
      <button
        key={option}
        type="button"
        aria-pressed={isSelected}
        onClick={onClick}
        className={cn(
          "flex min-h-14 w-full transform-gpu items-center justify-between gap-3 rounded-[24px] border px-4 py-3.5 text-left text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 active:scale-[0.99] sm:text-[15px]",
          isSelected
            ? "border-sky-500 bg-sky-50 text-slate-950 shadow-[0_18px_40px_-32px_rgba(14,165,233,0.95)]"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        )}
      >
        <span className="flex-1">{option}</span>
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
            isSelected
              ? "border-sky-500 bg-sky-500 text-white"
              : "border-slate-300 text-transparent"
          )}
          aria-hidden="true"
        >
          <CheckIcon className="h-3.5 w-3.5" />
        </span>
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_26%),linear-gradient(180deg,#f8fbff_0%,#edf3fb_100%)]">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:py-12">
        <div className="w-full px-1">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>Match Filters</span>
            <span>{progressPercent}% complete</span>
          </div>
          <div
            className="mt-3 h-2 rounded-full bg-slate-200/90"
            aria-label="Onboarding progress"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progressPercent}
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600 shadow-[0_8px_24px_-12px_rgba(37,99,235,0.9)] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <section
          className={cn(
            "mt-8 overflow-hidden rounded-[32px] border border-slate-200/80 bg-white shadow-[0_28px_90px_-48px_rgba(15,23,42,0.35)]",
            loadingSavedState && "opacity-90"
          )}
        >
          <div className="border-b border-slate-100 px-5 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-7">
            <div
              className={cn(
                "flex items-center",
                card.key === "summary" ? "justify-between" : "justify-between"
              )}
            >
              {card.key !== "summary" ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRestart}
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  Restart
                </button>
              )}

              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {card.key === "summary"
                  ? "Filters Ready"
                  : `Card ${cardIndex + 1} of ${QUESTION_CARD_COUNT}`}
              </span>
            </div>

            <div className="relative mt-6 overflow-hidden">
              <div
                className={cn(
                  "min-h-[360px] transform-gpu transition-all duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none sm:min-h-[400px]",
                  getMotionClass(motionPhase, motionDirection)
                )}
              >
                {card.key !== "summary" ? (
                  <div>
                    <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2.1rem]">
                      {card.question}
                    </h2>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                      {card.helper}
                    </p>

                    {card.layout === "list" ? (
                      <div className="mt-8 flex flex-col gap-3">
                        {card.key === "workSetup" &&
                          workSetupOptions.map((option) =>
                            renderOptionButton(
                              option,
                              answers.workSetup === option,
                              () => handleSingleSelect("workSetup", option)
                            )
                          )}
                        {card.key === "commute" &&
                          commuteOptions.map((option) =>
                            renderOptionButton(
                              option,
                              answers.commute === option,
                              () => handleSingleSelect("commute", option)
                            )
                          )}
                        {card.key === "schedule" &&
                          scheduleOptions.map((option) =>
                            renderOptionButton(
                              option,
                              answers.schedules.includes(option),
                              () => handleScheduleToggle(option)
                            )
                          )}
                      </div>
                    ) : (
                      <div className="mt-8">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {PAY_OPTIONS.map((option) => (
                            <button
                              key={option}
                              type="button"
                              aria-pressed={answers.paySelection === option}
                              onClick={() => handlePaySelect(option)}
                              className={cn(
                                "min-h-14 rounded-[24px] border px-4 py-3 text-left text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 active:scale-[0.99]",
                                answers.paySelection === option
                                  ? "border-sky-500 bg-sky-50 text-slate-950 shadow-[0_18px_40px_-32px_rgba(14,165,233,0.95)]"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                              )}
                            >
                              {option}
                            </button>
                          ))}
                        </div>

                        {answers.paySelection === CUSTOM_PAY_OPTION ? (
                          <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                            <label
                              htmlFor="custom-pay"
                              className="block text-sm font-semibold text-slate-800"
                            >
                              Enter your custom hourly minimum
                            </label>
                            <p className="mt-2 text-sm text-slate-500">
                              We&apos;ll use this as your first-pass pay floor.
                            </p>
                            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                              <span className="text-base font-semibold text-slate-500">$</span>
                              <input
                                id="custom-pay"
                                inputMode="numeric"
                                value={answers.customPay}
                                onChange={(event) =>
                                  setAnswers((current) => ({
                                    ...current,
                                    customPay: event.target.value.replace(/[^\d]/g, ""),
                                  }))
                                }
                                placeholder={String(SALARY_BOUNDS.hourly.min)}
                                className="h-8 w-full border-0 bg-transparent text-base font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                              />
                              <span className="text-sm text-slate-500">/ hour</span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2.1rem]">
                      {card.question}
                    </h2>
                    <div className="mt-8 grid gap-3">
                      {summaryItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <div
                            key={item.label}
                            className="flex items-start gap-4 rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4"
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                {item.label}
                              </div>
                              <div className="mt-1 text-sm font-semibold text-slate-900 sm:text-[15px]">
                                {item.value}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {error ? (
            <div
              className="mx-5 mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-8"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <div className="sticky bottom-0 z-10 mt-6 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-8">
            <div className="flex flex-col gap-3 sm:items-end">
              <Button
                type="button"
                size="lg"
                disabled={!currentStepValid || saving}
                onClick={handleForward}
                className="h-[52px] rounded-2xl bg-[#145efc] px-6 text-base font-semibold text-white shadow-[0_18px_42px_-22px_rgba(20,94,252,0.85)] hover:bg-[#0f4ed6] sm:min-w-[240px]"
              >
                {card.key === "summary" && saving ? "Saving..." : card.forwardLabel}
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
