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
    <div className="grid gap-6">
      <div className="rounded-md border border-slate-200 bg-white p-5 text-black">
        <h3 className="text-sm font-semibold text-black">Setup summary</h3>
        <dl className="mt-4 grid gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-black">Company</dt>
            <dd className="font-medium text-black">{form.companyName || "Not set"}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-black">Slug</dt>
            <dd className="font-mono text-black">{form.companySlug || "not-set"}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-black">Jobs</dt>
            <dd className="font-medium text-black">{form.jobs.length}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-black">Questions</dt>
            <dd className="font-medium text-black">{form.questions.length}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-black">Required fields</dt>
            <dd className="font-medium text-black">
              {form.requiredCandidateFields.length}
            </dd>
          </div>
        </dl>
        {form.companySlug ? (
          <Button
            asChild
            variant="outline"
            className="mt-5 w-full border-black bg-white text-black hover:bg-white hover:text-black"
          >
            <Link href={demoHref} target="_blank">
              Open demo preview
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="mt-5 w-full border-black bg-white text-black"
            disabled
          >
            Open demo preview
          </Button>
        )}
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-5 text-black">
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
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black">
                  {form.companyName || "Company"}
                </p>
                <h3 className="text-base font-semibold text-black">
                  {form.chatTitle || "Hirexa AI"}
                </h3>
                <p className="text-sm text-black">
                  {form.chatSubtitle || "Candidate screening assistant"}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <div className="max-w-[86%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-black">
              {form.welcomeMessage || "Welcome message preview"}
            </div>
            <div
              className="ml-auto max-w-[80%] rounded-2xl border bg-white px-4 py-3 text-sm text-black"
              style={{ borderColor: brandColor }}
            >
              I’m looking for a warehouse role.
            </div>
            <Badge className="border-slate-200 bg-white text-black">
              {form.tone} · {form.answerLength}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
