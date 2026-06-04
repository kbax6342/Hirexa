"use client";

import {
  ArrowTrendingUpIcon,
  ChatBubbleBottomCenterTextIcon,
  CheckBadgeIcon,
  ClockIcon,
  EnvelopeIcon,
  PhoneIcon,
  SparklesIcon,
  TruckIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

import {
  STAFFING_FIELD_LABELS,
  getCompletedStaffingFieldCount,
  normalizeRequiredStaffingFields,
  STAFFING_REQUIRED_FIELDS,
} from "@/app/lib/staffing/getMissingStaffingFields";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { cn } from "@/app/lib/utils";
import type { AiChatCompanySettings } from "@/app/types/ai-chat-settings";
import type {
  StaffingLeadApiSuccess,
  StaffingLeadDraft,
} from "@/app/types/staffing-screening";

type RecruiterLeadPreviewProps = {
  draftLead: StaffingLeadDraft;
  result: StaffingLeadApiSuccess | null;
  companySettings?: AiChatCompanySettings;
  onOpenChat: () => void;
};

function hasDraftContent(draftLead: StaffingLeadDraft) {
  return Object.values(draftLead).some((value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === "boolean") {
      return true;
    }

    return Boolean(String(value ?? "").trim());
  });
}

function formatValue(value: boolean | string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return value?.trim() ? value : "—";
}

export default function RecruiterLeadPreview({
  draftLead,
  result,
  companySettings,
  onOpenChat,
}: RecruiterLeadPreviewProps) {
  const requiredFields = companySettings
    ? normalizeRequiredStaffingFields(companySettings.requiredScreeningFields).filter(
        (field) =>
          companySettings.transportationQuestionEnabled ||
          field !== "transportationStatus"
      )
    : [...STAFFING_REQUIRED_FIELDS];
  const isStarted = hasDraftContent(draftLead);
  const completedCount = getCompletedStaffingFieldCount(draftLead, requiredFields);
  const statusLabel = result
    ? "Ready for recruiter review"
    : isStarted
      ? "Live screening in progress"
      : "Awaiting candidate chat";

  const statusClassName = result
    ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-700"
    : isStarted
      ? "border-sky-300/40 bg-sky-500/10 text-sky-700"
      : "border-slate-200 bg-white text-slate-600";

  const collectedFieldEntries = requiredFields.filter((field) => {
    const value = draftLead[field];
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === "boolean") {
      return true;
    }

    return typeof value === "string" && value.trim().length > 0;
  }).map((field) => ({
    label: STAFFING_FIELD_LABELS[field],
    value: formatValue(draftLead[field]),
  }));

  return (
    <Card className="rounded-[2rem] border-slate-200 bg-white shadow-[0_28px_80px_-52px_rgba(15,23,42,0.45)]">
      <CardContent className="p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700/80">
              Recruiter Lead Preview
            </p>
            <h3 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-slate-950">
              Candidate summary created from the live chat
            </h3>
            {companySettings?.companyName ? (
              <p className="mt-2 text-sm text-slate-600">
                Configured for {companySettings.companyName}
                {companySettings.companyLocation
                  ? ` in ${companySettings.companyLocation}`
                  : ""}
                .
              </p>
            ) : null}
          </div>

          <Badge className={cn("border px-3 py-1 text-xs", statusClassName)}>
            {statusLabel}
          </Badge>
        </div>

        <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">
              Screening progress
            </div>
            <div className="text-sm text-slate-600">
              {completedCount} of {requiredFields.length} fields complete
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {collectedFieldEntries.length > 0 ? (
              collectedFieldEntries.slice(0, 6).map((entry) => (
                <div
                  key={entry.label}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                >
                  <span className="font-semibold">{entry.label}:</span> {entry.value}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-600">
                No candidate details captured yet. Open the chat to start the live screening demo.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <UserCircleIcon className="h-5 w-5 text-sky-700" />
              Contact details
            </div>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div>
                <dt className="font-medium text-slate-500">Candidate name</dt>
                <dd className="mt-1 text-slate-900">
                  {formatValue(draftLead.candidateName)}
                </dd>
              </div>
              <div className="flex items-start gap-2">
                <PhoneIcon className="mt-0.5 h-4 w-4 text-slate-400" />
                <div>
                  <dt className="font-medium text-slate-500">Phone</dt>
                  <dd className="mt-1 text-slate-900">{formatValue(draftLead.phone)}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <EnvelopeIcon className="mt-0.5 h-4 w-4 text-slate-400" />
                <div>
                  <dt className="font-medium text-slate-500">Email</dt>
                  <dd className="mt-1 break-all text-slate-900">
                    {formatValue(draftLead.email)}
                  </dd>
                </div>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Preferred contact</dt>
                <dd className="mt-1 text-slate-900">
                  {formatValue(draftLead.preferredContactMethod)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ClockIcon className="h-5 w-5 text-sky-700" />
              Work readiness
            </div>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div>
                <dt className="font-medium text-slate-500">Desired work type</dt>
                <dd className="mt-1 text-slate-900">
                  {formatValue(draftLead.desiredWorkTypes)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Desired job type</dt>
                <dd className="mt-1 text-slate-900">
                  {formatValue(draftLead.desiredJobType)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Shift availability</dt>
                <dd className="mt-1 text-slate-900">
                  {formatValue(draftLead.shiftAvailability)}
                </dd>
              </div>
              <div className="flex items-start gap-2">
                <TruckIcon className="mt-0.5 h-4 w-4 text-slate-400" />
                <div>
                  <dt className="font-medium text-slate-500">Transportation</dt>
                  <dd className="mt-1 text-slate-900">
                    {formatValue(draftLead.transportationStatus)}
                  </dd>
                </div>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <SparklesIcon className="h-5 w-5 text-sky-700" />
                Recruiter-ready summary
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Hirexa AI collects contact information, role preferences, shift
                readiness, transportation, experience, pay expectations, and
                consent so recruiters can prioritize follow-up faster.
              </p>
            </div>

            {result ? (
              <div className="rounded-[1.5rem] border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-center text-emerald-800">
                <div className="text-xs font-semibold uppercase tracking-[0.18em]">
                  Lead score
                </div>
                <div className="mt-1 text-3xl font-semibold">{result.score}</div>
                <div className="mt-1 text-sm font-medium">{result.tier}</div>
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-center text-slate-600">
                <div className="text-xs font-semibold uppercase tracking-[0.18em]">
                  Lead score
                </div>
                <div className="mt-1 text-3xl font-semibold text-slate-900">--</div>
                <div className="mt-1 text-sm">Pending completion</div>
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ChatBubbleBottomCenterTextIcon className="h-4 w-4 text-sky-700" />
                Experience
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {formatValue(draftLead.experience)}
              </p>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ArrowTrendingUpIcon className="h-4 w-4 text-sky-700" />
                Desired pay
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {formatValue(draftLead.desiredPayRange)}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CheckBadgeIcon className="h-5 w-5 text-sky-700" />
              Recommended recruiter action
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {result?.recommendedAction ??
                "Complete the conversational screening to generate a scored recruiter lead."}
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              A recruiter will review your information. This chat does not make hiring decisions.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            Demo-ready output for a staffing recruiter queue or ATS handoff.
          </div>
          <Button
            type="button"
            onClick={onOpenChat}
            className="rounded-full bg-sky-600 px-5 text-white hover:bg-sky-500"
          >
            Open AI Chat Demo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
