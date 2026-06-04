"use client";

import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import type { CompanyChatbotInput } from "@/lib/chatbot/types";

type ChatbotPreviewPanelProps = {
  form: CompanyChatbotInput;
};

export default function ChatbotPreviewPanel({ form }: ChatbotPreviewPanelProps) {
  const brandColor = form.brandColor || "#0284c7";
  const demoHref = form.companySlug ? `/demo/${form.companySlug}` : "/demo";

  return (
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-md border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-950">Setup summary</h3>
        <dl className="mt-4 grid gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Company</dt>
            <dd className="font-medium text-slate-950">{form.companyName || "Not set"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Slug</dt>
            <dd className="font-mono text-slate-950">{form.companySlug || "not-set"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Jobs</dt>
            <dd className="font-medium text-slate-950">{form.jobs.length}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Questions</dt>
            <dd className="font-medium text-slate-950">{form.questions.length}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Required fields</dt>
            <dd className="font-medium text-slate-950">
              {form.requiredCandidateFields.length}
            </dd>
          </div>
        </dl>
        {form.companySlug ? (
          <Button asChild className="mt-5 w-full">
            <Link href={demoHref} target="_blank">
              Open demo preview
            </Link>
          </Button>
        ) : (
          <Button type="button" className="mt-5 w-full" disabled>
            Open demo preview
          </Button>
        )}
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-5">
        <div className="max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 overflow-hidden rounded-full border border-slate-200 bg-white">
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.logoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="h-full w-full"
                    style={{ backgroundColor: brandColor }}
                  />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {form.companyName || "Company"}
                </p>
                <h3 className="text-base font-semibold text-slate-950">
                  {form.chatTitle || "Hirexa AI"}
                </h3>
                <p className="text-sm text-slate-500">
                  {form.chatSubtitle || "Candidate screening assistant"}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <div className="max-w-[86%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950">
              {form.welcomeMessage || "Welcome message preview"}
            </div>
            <div
              className="ml-auto max-w-[80%] rounded-2xl border px-4 py-3 text-sm text-slate-950"
              style={{ borderColor: brandColor }}
            >
              I’m looking for a warehouse role.
            </div>
            <Badge className="border-slate-200 bg-white text-slate-700">
              {form.tone} · {form.answerLength}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
