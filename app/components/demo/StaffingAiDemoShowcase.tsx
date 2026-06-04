"use client";

import { useState } from "react";
import {
  ArrowRightIcon,
  ChatBubbleBottomCenterTextIcon,
  ClipboardDocumentListIcon,
  RocketLaunchIcon,
  SparklesIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

import RecruiterLeadPreview from "@/app/components/demo/RecruiterLeadPreview";
import StaffingAiChatDemo from "@/app/components/demo/StaffingAiChatDemo";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import type { AiChatCompanySettings } from "@/app/types/ai-chat-settings";
import type {
  StaffingLeadApiSuccess,
  StaffingLeadDraft,
} from "@/app/types/staffing-screening";

const capabilityCards = [
  {
    title: "Candidate screening on the website",
    text: "Engage staffing candidates the moment they land on the site, even outside recruiter working hours.",
    icon: ChatBubbleBottomCenterTextIcon,
  },
  {
    title: "Recruiter-ready lead capture",
    text: "Collect contact details, role interest, pay expectations, and shift readiness in a structured format.",
    icon: ClipboardDocumentListIcon,
  },
  {
    title: "Prioritized follow-up",
    text: "Score readiness and recommend next actions so recruiters know who to call first.",
    icon: RocketLaunchIcon,
  },
] as const;

const initialDraft: StaffingLeadDraft = {
  desiredWorkTypes: [],
  shiftAvailability: [],
  experience: [],
};

type StaffingAiDemoShowcaseProps = {
  companySlug?: string;
  companySettings?: AiChatCompanySettings;
};

export default function StaffingAiDemoShowcase({
  companySlug,
  companySettings,
}: StaffingAiDemoShowcaseProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [draftLead, setDraftLead] = useState<StaffingLeadDraft>(initialDraft);
  const [result, setResult] = useState<StaffingLeadApiSuccess | null>(null);

  function handleSubmitted(lead: StaffingLeadDraft, nextResult: StaffingLeadApiSuccess) {
    setDraftLead(lead);
    setResult(nextResult);
  }

  function handleRestart() {
    setDraftLead(initialDraft);
    setResult(null);
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[2rem] border-slate-200 bg-white shadow-[0_28px_80px_-52px_rgba(15,23,42,0.4)]">
          <CardContent className="p-6 sm:p-7">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="border-red-200 bg-red-50 text-red-700">
                Demo concept — not affiliated
              </Badge>
              <Badge className="border-sky-200 bg-sky-50 text-sky-700">
                Embedded AI Chat Demo
              </Badge>
            </div>

            <h3 className="mt-5 font-heading text-3xl font-semibold tracking-tight text-slate-950">
              Turn website visitors into screened candidates
            </h3>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              This demo shows how Hirexa AI can engage candidates, collect
              contact information, ask job-relevant questions, score readiness,
              and create recruiter-ready summaries for a staffing team.
            </p>

            <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(145deg,#f8fbff,#eef5ff)]">
              <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 text-sm text-slate-500">
                <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                <span className="ml-3 font-medium text-slate-600">
                  Embedded chat preview
                </span>
              </div>

              <div className="grid gap-4 p-5 sm:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <SparklesIcon className="h-5 w-5 text-sky-700" />
                    Candidate experience
                  </div>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                    <li className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600" />
                      Job seekers can describe what they want naturally instead of
                      clicking through a rigid form.
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600" />
                      Hirexa AI extracts screening details behind the scenes and
                      only asks concise follow-up questions for missing information.
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600" />
                      The candidate gets a clear expectation that a human recruiter
                      will review the submission.
                    </li>
                  </ul>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-950 p-5 text-white">
                  <div className="flex items-center gap-2 text-sm font-semibold text-sky-200">
                    <UserGroupIcon className="h-5 w-5" />
                    Recruiter outcomes
                  </div>
                  <div className="mt-5 space-y-3">
                    {capabilityCards.map((card) => (
                      <div
                        key={card.title}
                        className="rounded-[1.25rem] border border-white/10 bg-white/[0.05] p-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-100">
                            <card.icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {card.title}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-slate-300">
                              {card.text}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={() => setIsChatOpen(true)}
                className="rounded-full bg-sky-600 px-6 text-white hover:bg-sky-500"
              >
                Open AI Chat Demo
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-full border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
              >
                <a href="#solutions">View staffing solutions</a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <RecruiterLeadPreview
          draftLead={draftLead}
          result={result}
          companySettings={companySettings}
          onOpenChat={() => setIsChatOpen(true)}
        />
      </div>

      <StaffingAiChatDemo
        isOpen={isChatOpen}
        onOpenChange={setIsChatOpen}
        companySlug={companySlug}
        companySettings={companySettings}
        onDraftChange={setDraftLead}
        onSubmitted={handleSubmitted}
        onRestart={handleRestart}
      />
    </>
  );
}
