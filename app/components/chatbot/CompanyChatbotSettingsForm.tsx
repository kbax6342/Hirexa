"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
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

function SettingsSection({
  children,
  id,
  title,
}: {
  children: ReactNode;
  id: string;
  title: string;
}) {
  return (
    <section
      id={id}
      className="rounded-md border border-slate-200 bg-white p-5 text-black shadow-sm sm:p-6"
    >
      <h2 className="text-lg font-semibold text-black">{title}</h2>
      <div className="mt-5 text-black [&_a]:text-black [&_button]:border-black [&_button]:bg-white [&_button]:text-black [&_dd]:text-black [&_div]:bg-white [&_dt]:text-black [&_h3]:text-black [&_h4]:text-black [&_input]:bg-white [&_input]:text-black [&_label]:text-black [&_p]:text-black [&_select]:border-slate-300 [&_select]:bg-white [&_select]:text-black [&_span]:text-black [&_textarea]:bg-white [&_textarea]:text-black">
        {children}
      </div>
    </section>
  );
}

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
    <div className="mx-auto max-w-5xl px-4 py-8 text-black sm:px-6 lg:px-8">
      <div className="mb-6 mt-[60px] flex flex-col gap-4">
        <div>
          <Button
            asChild
            variant="ghost"
            className="-ml-3 mb-3 bg-white text-black hover:bg-white hover:text-black"
          >
            <Link href="/dashboard/chatbots">
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-black">
            {mode === "create" ? "New company chatbot" : "Company chatbot setup"}
          </h1>
          <p className="mt-1 text-sm text-black">
            Configure reusable Hirexa AI settings for demos, embeds, screening, and lead routing.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {form.companySlug ? (
            <Button
              asChild
              variant="outline"
              className="border-black bg-white text-black hover:bg-white hover:text-black"
            >
              <Link href={previewHref} target="_blank">
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                Preview demo
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="border-black bg-white text-black"
              disabled
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              Preview demo
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="border-black bg-white text-black hover:bg-white hover:text-black"
            onClick={saveSettings}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save setup"}
          </Button>
        </div>
      </div>

      {message ? (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-black bg-white px-4 py-3 text-sm text-black">
          <CheckCircleIcon className="h-4 w-4" />
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-black bg-white px-4 py-3 text-sm text-black">
          {error}
        </div>
      ) : null}

      <div className="space-y-5">
        <SettingsSection id="company-profile" title="Company Profile">
          <CompanyProfileSection
            form={{ ...form, companyName: form.companyName }}
            fieldErrors={fieldErrors}
            update={(patch) =>
              "companyName" in patch
                ? updateCompanyName(patch.companyName ?? "")
                : update(patch)
            }
          />
        </SettingsSection>

        <SettingsSection id="branding" title="Branding">
          <ChatbotBrandingSection
            form={form}
            fieldErrors={fieldErrors}
            update={update}
          />
        </SettingsSection>

        <SettingsSection id="ai-behavior" title="AI Behavior">
          <ChatbotAiBehaviorSection form={form} update={update} />
        </SettingsSection>

        <SettingsSection id="candidate-fields" title="Candidate Fields">
          <CandidateFieldsSection
            form={form}
            fieldErrors={fieldErrors}
            update={update}
          />
        </SettingsSection>

        <SettingsSection id="jobs" title="Jobs">
          <ChatbotJobsSection form={form} update={update} />
        </SettingsSection>

        <SettingsSection id="screening-questions" title="Screening Questions">
          <ScreeningQuestionsSection form={form} update={update} />
        </SettingsSection>

        <SettingsSection id="qualification-rules" title="Qualification Rules">
          <QualificationRulesSection form={form} update={update} />
        </SettingsSection>

        <SettingsSection id="lead-routing" title="Lead Routing">
          <LeadRoutingSection form={form} update={update} />
        </SettingsSection>

        <SettingsSection id="preview" title="Preview">
          <ChatbotPreviewPanel form={form} />
        </SettingsSection>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="border-black bg-white text-black hover:bg-white hover:text-black"
          onClick={saveSettings}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save setup"}
        </Button>
      </div>
    </div>
  );
}
