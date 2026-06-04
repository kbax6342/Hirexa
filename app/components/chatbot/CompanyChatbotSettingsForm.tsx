"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

import CandidateFieldsSection from "@/app/components/chatbot/CandidateFieldsSection";
import ChatbotAiBehaviorSection from "@/app/components/chatbot/ChatbotAiBehaviorSection";
import ChatbotBrandingSection from "@/app/components/chatbot/ChatbotBrandingSection";
import ChatbotJobsSection from "@/app/components/chatbot/ChatbotJobsSection";
import ChatbotPreviewPanel from "@/app/components/chatbot/ChatbotPreviewPanel";
import CompanyProfileSection from "@/app/components/chatbot/CompanyProfileSection";
import LeadRoutingSection from "@/app/components/chatbot/LeadRoutingSection";
import QualificationRulesSection from "@/app/components/chatbot/QualificationRulesSection";
import ScreeningQuestionsSection from "@/app/components/chatbot/ScreeningQuestionsSection";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import {
  DEFAULT_COMPANY_CHATBOT_INPUT,
  type CompanyChatbotInput,
  type CompanyChatbotRecord,
} from "@/lib/chatbot/types";

type CompanyChatbotSettingsFormProps = {
  mode: "create" | "edit";
  initialChatbot?: CompanyChatbotRecord | null;
};

type SaveResponse = {
  ok?: boolean;
  chatbot?: CompanyChatbotRecord;
  error?: string;
  fieldErrors?: Record<string, string>;
};

function cloneForm(input: CompanyChatbotInput) {
  return JSON.parse(JSON.stringify(input)) as CompanyChatbotInput;
}

function slugFromName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const tabs = [
  ["company", "Company Profile"],
  ["branding", "Branding"],
  ["behavior", "AI Behavior"],
  ["fields", "Candidate Fields"],
  ["jobs", "Jobs"],
  ["questions", "Screening Questions"],
  ["qualification", "Qualification Rules"],
  ["routing", "Lead Routing"],
  ["preview", "Preview"],
] as const;

export default function CompanyChatbotSettingsForm({
  mode,
  initialChatbot,
}: CompanyChatbotSettingsFormProps) {
  const router = useRouter();
  const initialSlug = initialChatbot?.companySlug ?? "";
  const initialForm = useMemo(
    () => cloneForm(initialChatbot ?? DEFAULT_COMPANY_CHATBOT_INPUT),
    [initialChatbot]
  );
  const [form, setForm] = useState<CompanyChatbotInput>(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function update(patch: Partial<CompanyChatbotInput>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function updateCompanyName(companyName: string) {
    setForm((current) => ({
      ...current,
      companyName,
      companySlug: current.companySlug || slugFromName(companyName),
    }));
  }

  async function saveSettings() {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});

    try {
      const endpoint =
        mode === "create"
          ? "/api/chatbots"
          : `/api/chatbots/${encodeURIComponent(initialSlug)}`;
      const response = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json().catch(() => null)) as SaveResponse | null;

      if (!response.ok || !payload?.ok || !payload.chatbot) {
        if (payload?.fieldErrors) setFieldErrors(payload.fieldErrors);
        throw new Error(payload?.error ?? "Unable to save chatbot setup.");
      }

      setForm(cloneForm(payload.chatbot));
      setMessage("Company chatbot setup saved.");

      if (mode === "create" || payload.chatbot.companySlug !== initialSlug) {
        router.push(`/dashboard/chatbots/${payload.chatbot.companySlug}/settings`);
      } else {
        router.refresh();
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save chatbot setup."
      );
    } finally {
      setIsSaving(false);
    }
  }

  const previewHref = form.companySlug ? `/demo/${form.companySlug}` : "/demo";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 mt-[60px] flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Button asChild variant="ghost" className="-ml-3 mb-3 text-slate-600">
            <Link href="/dashboard/chatbots">
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            {mode === "create" ? "New company chatbot" : "Company chatbot setup"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure reusable Hirexa AI settings for demos, embeds, screening, and lead routing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {form.companySlug ? (
            <Button asChild variant="outline">
              <Link href={previewHref} target="_blank">
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                Preview demo
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled>
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              Preview demo
            </Button>
          )}
          <Button type="button" onClick={saveSettings} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save setup"}
          </Button>
        </div>
      </div>

      {message ? (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircleIcon className="h-4 w-4" />
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Tabs defaultValue="company" className="w-full">
        <TabsList className="mb-5 flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          {tabs.map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm data-[state=active]:border-slate-950 data-[state=active]:bg-slate-950 data-[state=active]:text-white"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <Card className="border-slate-200">
          <CardContent className="p-5 sm:p-6">
            <TabsContent value="company" className="m-0">
              <CompanyProfileSection
                form={{ ...form, companyName: form.companyName }}
                fieldErrors={fieldErrors}
                update={(patch) =>
                  "companyName" in patch
                    ? updateCompanyName(patch.companyName ?? "")
                    : update(patch)
                }
              />
            </TabsContent>
            <TabsContent value="branding" className="m-0">
              <ChatbotBrandingSection
                form={form}
                fieldErrors={fieldErrors}
                update={update}
              />
            </TabsContent>
            <TabsContent value="behavior" className="m-0">
              <ChatbotAiBehaviorSection form={form} update={update} />
            </TabsContent>
            <TabsContent value="fields" className="m-0">
              <CandidateFieldsSection
                form={form}
                fieldErrors={fieldErrors}
                update={update}
              />
            </TabsContent>
            <TabsContent value="jobs" className="m-0">
              <ChatbotJobsSection form={form} update={update} />
            </TabsContent>
            <TabsContent value="questions" className="m-0">
              <ScreeningQuestionsSection form={form} update={update} />
            </TabsContent>
            <TabsContent value="qualification" className="m-0">
              <QualificationRulesSection form={form} update={update} />
            </TabsContent>
            <TabsContent value="routing" className="m-0">
              <LeadRoutingSection form={form} update={update} />
            </TabsContent>
            <TabsContent value="preview" className="m-0">
              <ChatbotPreviewPanel form={form} />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>

      <div className="mt-6 flex justify-end">
        <Button type="button" onClick={saveSettings} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save setup"}
        </Button>
      </div>
    </div>
  );
}
