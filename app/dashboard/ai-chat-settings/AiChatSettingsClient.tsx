"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BuildingOffice2Icon,
  ChatBubbleBottomCenterTextIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { Textarea } from "@/app/components/ui/textarea";
import {
  AI_CHAT_ASSISTANT_TONES,
  AI_CHAT_LEAD_DELIVERY_METHODS,
  type AiChatCompanySettings,
} from "@/app/types/ai-chat-settings";

type SettingsApiResponse =
  | {
      ok: true;
      settings: AiChatCompanySettings;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
    };

function parseListInput(value: string) {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function stringifyList(values: string[] | undefined) {
  return (values ?? []).join("\n");
}

function FormSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="rounded-[2rem] border-slate-200 bg-white shadow-sm">
      <CardContent className="p-6 sm:p-7">
        <div className="max-w-3xl">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-slate-950">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2">{children}</div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function AiChatSettingsClient() {
  const [settings, setSettings] = useState<AiChatCompanySettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<AiChatCompanySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>(
    {}
  );

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/ai-chat/settings", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | SettingsApiResponse
          | null;

        if (!response.ok || !payload || !payload.ok) {
          throw new Error(
            payload && !payload.ok
              ? payload.error
              : "Unable to load AI chat settings."
          );
        }

        if (!isMounted) return;
        setSettings(payload.settings);
        setSavedSettings(payload.settings);
      } catch (loadError) {
        if (!isMounted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load AI chat settings."
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const previewHref = useMemo(() => {
    const slug = settings?.companySlug?.trim();
    return slug
      ? `/demo/minutemen-ai-chat?companySlug=${encodeURIComponent(slug)}`
      : "/demo/minutemen-ai-chat";
  }, [settings?.companySlug]);

  function updateField<K extends keyof AiChatCompanySettings>(
    key: K,
    value: AiChatCompanySettings[K]
  ) {
    setSettings((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current
    );
    setSuccessMessage(null);
  }

  function resetToLoadedSettings() {
    if (!savedSettings) return;
    setSettings(savedSettings);
    setFieldErrors({});
    setError(null);
    setSuccessMessage(null);
  }

  async function handleSave() {
    if (!settings) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/ai-chat/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      const payload = (await response.json().catch(() => null)) as
        | SettingsApiResponse
        | null;

      if (!response.ok || !payload || !payload.ok) {
        setFieldErrors(
          payload && !payload.ok && payload.fieldErrors ? payload.fieldErrors : {}
        );
        throw new Error(
          payload && !payload.ok
            ? payload.error
            : "Unable to save AI chat settings."
        );
      }

      setSettings(payload.settings);
      setSavedSettings(payload.settings);
      setSuccessMessage("AI chat settings saved successfully.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save AI chat settings."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || !settings) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm text-slate-600">Loading AI chat settings...</div>
      </div>
    );
  }

  return (
    <div
      id="hirexa-ai-chat-settings-page"
      className="space-y-6"
    >
      <Card
        id="hirexa-ai-chat-settings-header"
        className="rounded-[2rem] border-slate-200 bg-[linear-gradient(145deg,#ffffff,#eef5ff)] shadow-sm"
      >
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-sky-200 bg-sky-50 text-sky-700">
                  Backend AI Chat Settings
                </Badge>
                <Badge className="border-slate-200 bg-white text-slate-700">
                  Company-specific screening
                </Badge>
              </div>
              <h1 className="mt-4 font-heading text-4xl font-semibold tracking-tight text-slate-950">
                Configure Hirexa AI for each company&apos;s hiring flow
              </h1>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Customize greeting, tone, screening focus, hiring roles, routing,
                and embed behavior while keeping the conversation job-relevant and
                recruiter-reviewed.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Active company slug
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-950">
                {settings.companySlug}
              </div>
              <div className="mt-2 text-sm text-slate-600">
                Preview URL: {previewHref}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Protected-characteristic questions are never allowed. This settings
            system only configures job-relevant screening behavior, and every
            completion flow still requires recruiter review before any hiring
            decision.
          </div>

          {error ? (
            <div className="mt-4 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-4 rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              id="hirexa-ai-chat-settings-save-button"
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="rounded-full bg-sky-600 px-6 text-white hover:bg-sky-500"
            >
              <CheckCircleIcon className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save settings"}
            </Button>
            <Button
              id="hirexa-ai-chat-settings-reset-button"
              type="button"
              variant="outline"
              onClick={resetToLoadedSettings}
              className="rounded-full border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Reset changes
            </Button>
            <Button
              id="hirexa-ai-chat-settings-preview-button"
              asChild
              variant="outline"
              className="rounded-full border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
            >
              <Link href={previewHref} target="_blank">
                Preview AI Chat
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <FormSection
        id="hirexa-ai-chat-settings-company-section"
        title="Company Identity"
        description="Define the company brand and the high-level context the assistant should use."
      >
        <Field
          label="Company name"
          htmlFor="hirexa-ai-chat-settings-company-name"
          hint={fieldErrors.companyName?.[0]}
        >
          <Input
            id="hirexa-ai-chat-settings-company-name"
            value={settings.companyName}
            onChange={(event) => updateField("companyName", event.target.value)}
          />
        </Field>
        <Field
          label="Company slug"
          htmlFor="hirexa-ai-chat-settings-company-slug"
          hint={fieldErrors.companySlug?.[0]}
        >
          <Input
            id="hirexa-ai-chat-settings-company-slug"
            value={settings.companySlug}
            onChange={(event) => updateField("companySlug", event.target.value)}
          />
        </Field>
        <Field label="Company website" htmlFor="hirexa-ai-chat-settings-company-website">
          <Input
            id="hirexa-ai-chat-settings-company-website"
            value={settings.companyWebsite ?? ""}
            onChange={(event) => updateField("companyWebsite", event.target.value)}
          />
        </Field>
        <Field label="Company industry" htmlFor="hirexa-ai-chat-settings-company-industry">
          <Input
            id="hirexa-ai-chat-settings-company-industry"
            value={settings.companyIndustry ?? ""}
            onChange={(event) => updateField("companyIndustry", event.target.value)}
          />
        </Field>
        <div className="md:col-span-2">
          <Field
            label="Company description"
            htmlFor="hirexa-ai-chat-settings-company-description"
          >
            <Textarea
              id="hirexa-ai-chat-settings-company-description"
              value={settings.companyDescription ?? ""}
              onChange={(event) =>
                updateField("companyDescription", event.target.value)
              }
              className="min-h-[120px]"
            />
          </Field>
        </div>
        <Field label="Company location" htmlFor="hirexa-ai-chat-settings-company-location">
          <Input
            id="hirexa-ai-chat-settings-company-location"
            value={settings.companyLocation ?? ""}
            onChange={(event) => updateField("companyLocation", event.target.value)}
          />
        </Field>
        <Field label="Company logo URL" htmlFor="hirexa-ai-chat-settings-logo-url">
          <Input
            id="hirexa-ai-chat-settings-logo-url"
            value={settings.companyLogoUrl ?? ""}
            onChange={(event) => updateField("companyLogoUrl", event.target.value)}
          />
        </Field>
        <Field label="Brand primary color" htmlFor="hirexa-ai-chat-settings-brand-color">
          <Input
            id="hirexa-ai-chat-settings-brand-color"
            value={settings.brandPrimaryColor ?? ""}
            onChange={(event) => updateField("brandPrimaryColor", event.target.value)}
            placeholder="#0284c7"
          />
        </Field>
      </FormSection>

      <FormSection
        id="hirexa-ai-chat-settings-hiring-section"
        title="Hiring Configuration"
        description="Describe the hiring focus, roles, and job conditions the AI assistant should reference."
      >
        <div className="md:col-span-2">
          <Field label="Hiring focus" htmlFor="hirexa-ai-chat-settings-hiring-focus">
            <Textarea
              id="hirexa-ai-chat-settings-hiring-focus"
              value={settings.hiringFocus ?? ""}
              onChange={(event) => updateField("hiringFocus", event.target.value)}
              className="min-h-[100px]"
            />
          </Field>
        </div>
        <Field label="Primary roles" htmlFor="hirexa-ai-chat-settings-primary-roles">
          <Textarea
            id="hirexa-ai-chat-settings-primary-roles"
            value={stringifyList(settings.primaryRoles)}
            onChange={(event) =>
              updateField("primaryRoles", parseListInput(event.target.value))
            }
            className="min-h-[140px]"
          />
        </Field>
        <Field label="Industries" htmlFor="hirexa-ai-chat-settings-industries">
          <Textarea
            id="hirexa-ai-chat-settings-industries"
            value={stringifyList(settings.industries)}
            onChange={(event) =>
              updateField("industries", parseListInput(event.target.value))
            }
            className="min-h-[140px]"
          />
        </Field>
        <Field label="Employment types" htmlFor="hirexa-ai-chat-settings-employment-types">
          <Textarea
            id="hirexa-ai-chat-settings-employment-types"
            value={stringifyList(settings.employmentTypes)}
            onChange={(event) =>
              updateField("employmentTypes", parseListInput(event.target.value))
            }
            className="min-h-[140px]"
          />
        </Field>
        <Field label="Shift options" htmlFor="hirexa-ai-chat-settings-shift-options">
          <Textarea
            id="hirexa-ai-chat-settings-shift-options"
            value={stringifyList(settings.shiftOptions)}
            onChange={(event) =>
              updateField("shiftOptions", parseListInput(event.target.value))
            }
            className="min-h-[140px]"
          />
        </Field>
        <Field label="Location coverage" htmlFor="hirexa-ai-chat-settings-location-coverage">
          <Textarea
            id="hirexa-ai-chat-settings-location-coverage"
            value={stringifyList(settings.locationCoverage)}
            onChange={(event) =>
              updateField("locationCoverage", parseListInput(event.target.value))
            }
            className="min-h-[120px]"
          />
        </Field>
        <Field label="Desired experience" htmlFor="hirexa-ai-chat-settings-desired-experience">
          <Textarea
            id="hirexa-ai-chat-settings-desired-experience"
            value={stringifyList(settings.desiredExperience)}
            onChange={(event) =>
              updateField("desiredExperience", parseListInput(event.target.value))
            }
            className="min-h-[120px]"
          />
        </Field>
        <Field
          label="Required qualifications"
          htmlFor="hirexa-ai-chat-settings-required-qualifications"
        >
          <Textarea
            id="hirexa-ai-chat-settings-required-qualifications"
            value={stringifyList(settings.requiredQualifications)}
            onChange={(event) =>
              updateField(
                "requiredQualifications",
                parseListInput(event.target.value)
              )
            }
            className="min-h-[120px]"
          />
        </Field>
        <Field
          label="Preferred qualifications"
          htmlFor="hirexa-ai-chat-settings-preferred-qualifications"
        >
          <Textarea
            id="hirexa-ai-chat-settings-preferred-qualifications"
            value={stringifyList(settings.preferredQualifications)}
            onChange={(event) =>
              updateField(
                "preferredQualifications",
                parseListInput(event.target.value)
              )
            }
            className="min-h-[120px]"
          />
        </Field>
        <Field label="Pay range" htmlFor="hirexa-ai-chat-settings-pay-range">
          <Input
            id="hirexa-ai-chat-settings-pay-range"
            value={settings.payRange ?? ""}
            onChange={(event) => updateField("payRange", event.target.value)}
          />
        </Field>
        <Field
          label="Start availability options"
          htmlFor="hirexa-ai-chat-settings-start-availability-options"
        >
          <Textarea
            id="hirexa-ai-chat-settings-start-availability-options"
            value={stringifyList(settings.startAvailabilityOptions)}
            onChange={(event) =>
              updateField(
                "startAvailabilityOptions",
                parseListInput(event.target.value)
              )
            }
            className="min-h-[120px]"
          />
        </Field>
        <div className="space-y-3">
          <Label htmlFor="hirexa-ai-chat-settings-transportation-enabled">
            Transportation question enabled
          </Label>
          <div className="flex items-center gap-3 rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3">
            <Switch
              id="hirexa-ai-chat-settings-transportation-enabled"
              checked={settings.transportationQuestionEnabled}
              onCheckedChange={(checked) =>
                updateField("transportationQuestionEnabled", checked)
              }
            />
            <span className="text-sm text-slate-600">
              Ask candidates about reliable transportation.
            </span>
          </div>
        </div>
      </FormSection>

      <FormSection
        id="hirexa-ai-chat-settings-recruiter-section"
        title="Recruiter / Lead Routing"
        description="Control who receives leads and how the AI should frame recruiter handoff."
      >
        <Field label="Recruiter name" htmlFor="hirexa-ai-chat-settings-recruiter-name">
          <Input
            id="hirexa-ai-chat-settings-recruiter-name"
            value={settings.recruiterName ?? ""}
            onChange={(event) => updateField("recruiterName", event.target.value)}
          />
        </Field>
        <Field
          label="Recruiter email"
          htmlFor="hirexa-ai-chat-settings-recruiter-email"
          hint={fieldErrors.recruiterEmail?.[0]}
        >
          <Input
            id="hirexa-ai-chat-settings-recruiter-email"
            value={settings.recruiterEmail ?? ""}
            onChange={(event) => updateField("recruiterEmail", event.target.value)}
          />
        </Field>
        <Field label="Recruiter phone" htmlFor="hirexa-ai-chat-settings-recruiter-phone">
          <Input
            id="hirexa-ai-chat-settings-recruiter-phone"
            value={settings.recruiterPhone ?? ""}
            onChange={(event) => updateField("recruiterPhone", event.target.value)}
          />
        </Field>
        <Field
          label="Lead notification email"
          htmlFor="hirexa-ai-chat-settings-lead-notification-email"
          hint={fieldErrors.leadNotificationEmail?.[0]}
        >
          <Input
            id="hirexa-ai-chat-settings-lead-notification-email"
            value={settings.leadNotificationEmail ?? ""}
            onChange={(event) =>
              updateField("leadNotificationEmail", event.target.value)
            }
          />
        </Field>
        <Field
          label="Lead delivery method"
          htmlFor="hirexa-ai-chat-settings-lead-delivery-method"
        >
          <Select
            value={settings.leadDeliveryMethod ?? "mock"}
            onValueChange={(value) =>
              updateField(
                "leadDeliveryMethod",
                value as AiChatCompanySettings["leadDeliveryMethod"]
              )
            }
          >
            <SelectTrigger id="hirexa-ai-chat-settings-lead-delivery-method">
              <SelectValue placeholder="Choose a delivery method" />
            </SelectTrigger>
            <SelectContent>
              {AI_CHAT_LEAD_DELIVERY_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Lead priority rules"
          htmlFor="hirexa-ai-chat-settings-lead-priority-rules"
        >
          <Textarea
            id="hirexa-ai-chat-settings-lead-priority-rules"
            value={stringifyList(settings.leadPriorityRules)}
            onChange={(event) =>
              updateField("leadPriorityRules", parseListInput(event.target.value))
            }
            className="min-h-[120px]"
          />
        </Field>
      </FormSection>

      <FormSection
        id="hirexa-ai-chat-settings-behavior-section"
        title="AI Chat Behavior"
        description="Customize the assistant voice, greeting, compliance copy, and feature flags."
      >
        <Field
          label="Chat display name"
          htmlFor="hirexa-ai-chat-settings-chat-display-name"
          hint={fieldErrors.chatDisplayName?.[0]}
        >
          <Input
            id="hirexa-ai-chat-settings-chat-display-name"
            value={settings.chatDisplayName}
            onChange={(event) => updateField("chatDisplayName", event.target.value)}
          />
        </Field>
        <Field label="Assistant tone" htmlFor="hirexa-ai-chat-settings-assistant-tone">
          <Select
            value={settings.assistantTone ?? "friendly"}
            onValueChange={(value) =>
              updateField(
                "assistantTone",
                value as AiChatCompanySettings["assistantTone"]
              )
            }
          >
            <SelectTrigger id="hirexa-ai-chat-settings-assistant-tone">
              <SelectValue placeholder="Choose a tone" />
            </SelectTrigger>
            <SelectContent>
              {AI_CHAT_ASSISTANT_TONES.map((tone) => (
                <SelectItem key={tone} value={tone}>
                  {tone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Welcome message" htmlFor="hirexa-ai-chat-settings-welcome-message">
            <Textarea
              id="hirexa-ai-chat-settings-welcome-message"
              value={settings.welcomeMessage ?? ""}
              onChange={(event) => updateField("welcomeMessage", event.target.value)}
              className="min-h-[120px]"
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field
            label="Custom instructions"
            htmlFor="hirexa-ai-chat-settings-custom-instructions"
          >
            <Textarea
              id="hirexa-ai-chat-settings-custom-instructions"
              value={settings.customInstructions ?? ""}
              onChange={(event) =>
                updateField("customInstructions", event.target.value)
              }
              className="min-h-[120px]"
            />
          </Field>
        </div>
        <Field label="Fallback message" htmlFor="hirexa-ai-chat-settings-fallback-message">
          <Textarea
            id="hirexa-ai-chat-settings-fallback-message"
            value={settings.fallbackMessage ?? ""}
            onChange={(event) => updateField("fallbackMessage", event.target.value)}
            className="min-h-[100px]"
          />
        </Field>
        <Field
          label="Completion message"
          htmlFor="hirexa-ai-chat-settings-completion-message"
        >
          <Textarea
            id="hirexa-ai-chat-settings-completion-message"
            value={settings.completionMessage ?? ""}
            onChange={(event) =>
              updateField("completionMessage", event.target.value)
            }
            className="min-h-[100px]"
          />
        </Field>
        <div className="md:col-span-2">
          <Field
            label="Compliance disclaimer"
            htmlFor="hirexa-ai-chat-settings-compliance-disclaimer"
            hint={fieldErrors.complianceDisclaimer?.[0]}
          >
            <Textarea
              id="hirexa-ai-chat-settings-compliance-disclaimer"
              value={settings.complianceDisclaimer ?? ""}
              onChange={(event) =>
                updateField("complianceDisclaimer", event.target.value)
              }
              className="min-h-[120px]"
            />
          </Field>
        </div>
        <div className="grid gap-4 md:col-span-2 sm:grid-cols-2">
          {[
            {
              id: "hirexa-ai-chat-settings-require-consent",
              label: "Require consent to contact",
              field: "requireConsentToContact" as const,
            },
            {
              id: "hirexa-ai-chat-settings-allow-resume-upload",
              label: "Allow resume upload",
              field: "allowResumeUpload" as const,
            },
            {
              id: "hirexa-ai-chat-settings-allow-job-recommendations",
              label: "Allow job recommendations",
              field: "allowJobRecommendations" as const,
            },
            {
              id: "hirexa-ai-chat-settings-allow-recruiter-escalation",
              label: "Allow recruiter escalation",
              field: "allowRecruiterEscalation" as const,
            },
          ].map((toggle) => (
            <div
              key={toggle.id}
              className="flex items-center justify-between rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <Label htmlFor={toggle.id}>{toggle.label}</Label>
              <Switch
                id={toggle.id}
                checked={Boolean(settings[toggle.field])}
                onCheckedChange={(checked) =>
                  updateField(toggle.field, checked as AiChatCompanySettings[typeof toggle.field])
                }
              />
            </div>
          ))}
        </div>
      </FormSection>

      <FormSection
        id="hirexa-ai-chat-settings-screening-section"
        title="Screening Requirements"
        description="Choose what the AI must collect before the screening can complete and what extra rules recruiters care about."
      >
        <Field
          label="Required screening fields"
          htmlFor="hirexa-ai-chat-settings-required-fields"
          hint={fieldErrors.requiredScreeningFields?.[0]}
        >
          <Textarea
            id="hirexa-ai-chat-settings-required-fields"
            value={stringifyList(settings.requiredScreeningFields)}
            onChange={(event) =>
              updateField(
                "requiredScreeningFields",
                parseListInput(event.target.value)
              )
            }
            className="min-h-[150px]"
          />
        </Field>
        <Field
          label="Optional screening fields"
          htmlFor="hirexa-ai-chat-settings-optional-fields"
        >
          <Textarea
            id="hirexa-ai-chat-settings-optional-fields"
            value={stringifyList(settings.optionalScreeningFields)}
            onChange={(event) =>
              updateField(
                "optionalScreeningFields",
                parseListInput(event.target.value)
              )
            }
            className="min-h-[150px]"
          />
        </Field>
        <Field label="Knockout rules" htmlFor="hirexa-ai-chat-settings-knockout-rules">
          <Textarea
            id="hirexa-ai-chat-settings-knockout-rules"
            value={stringifyList(settings.knockoutRules)}
            onChange={(event) =>
              updateField("knockoutRules", parseListInput(event.target.value))
            }
            className="min-h-[120px]"
          />
        </Field>
        <Field label="Scoring rules" htmlFor="hirexa-ai-chat-settings-scoring-rules">
          <Textarea
            id="hirexa-ai-chat-settings-scoring-rules"
            value={stringifyList(settings.scoringRules)}
            onChange={(event) =>
              updateField("scoringRules", parseListInput(event.target.value))
            }
            className="min-h-[120px]"
          />
        </Field>
      </FormSection>

      <FormSection
        id="hirexa-ai-chat-settings-embed-section"
        title="Embed / Demo"
        description="Control whether the chat is public, demo-ready, and where it can be embedded."
      >
        <div className="grid gap-4 md:col-span-2 sm:grid-cols-3">
          {[
            {
              id: "hirexa-ai-chat-settings-public-enabled",
              label: "Public chat enabled",
              field: "publicChatEnabled" as const,
            },
            {
              id: "hirexa-ai-chat-settings-demo-mode",
              label: "Demo mode enabled",
              field: "demoModeEnabled" as const,
            },
            {
              id: "hirexa-ai-chat-settings-embed-enabled",
              label: "Embed script enabled",
              field: "embedScriptEnabled" as const,
            },
          ].map((toggle) => (
            <div
              key={toggle.id}
              className="flex items-center justify-between rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <Label htmlFor={toggle.id}>{toggle.label}</Label>
              <Switch
                id={toggle.id}
                checked={Boolean(settings[toggle.field])}
                onCheckedChange={(checked) =>
                  updateField(toggle.field, checked as AiChatCompanySettings[typeof toggle.field])
                }
              />
            </div>
          ))}
        </div>
        <div className="md:col-span-2">
          <Field
            label="Allowed domains"
            htmlFor="hirexa-ai-chat-settings-allowed-domains"
          >
            <Textarea
              id="hirexa-ai-chat-settings-allowed-domains"
              value={stringifyList(settings.allowedDomains)}
              onChange={(event) =>
                updateField("allowedDomains", parseListInput(event.target.value))
              }
              className="min-h-[120px]"
            />
          </Field>
        </div>
      </FormSection>

      <Card
        id="hirexa-ai-chat-settings-preview-section"
        className="rounded-[2rem] border-slate-200 bg-white shadow-sm"
      >
        <CardContent className="p-6 sm:p-7">
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-sky-700/80">
                <ChatBubbleBottomCenterTextIcon className="h-5 w-5" />
                Live preview
              </div>
              <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-slate-950">
                Your chat will greet candidates like this:
              </h2>
              <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(145deg,#0f172a,#172554)] p-5 text-white shadow-[0_20px_70px_-45px_rgba(15,23,42,0.9)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                    <Cog6ToothIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/80">
                      {settings.chatDisplayName}
                    </div>
                    <div className="text-lg font-semibold text-white">
                      {settings.companyName}
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-100">
                  {settings.welcomeMessage}
                </p>
                <p
                  className="mt-4 rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-xs leading-6 text-slate-300"
                  id="hirexa-ai-chat-settings-preview-disclaimer"
                >
                  {settings.complianceDisclaimer}
                </p>
              </div>
            </div>

            <div className="flex-1 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <BuildingOffice2Icon className="h-5 w-5 text-sky-700" />
                Preview details
              </div>
              <dl className="mt-5 space-y-4 text-sm text-slate-700">
                <div>
                  <dt className="font-medium text-slate-500">Company</dt>
                  <dd className="mt-1">{settings.companyName}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Hiring for</dt>
                  <dd className="mt-1">
                    {settings.primaryRoles.length > 0
                      ? settings.primaryRoles.join(", ")
                      : "No roles configured yet."}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Location</dt>
                  <dd className="mt-1">{settings.companyLocation || "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Tone</dt>
                  <dd className="mt-1">{settings.assistantTone || "friendly"}</dd>
                </div>
              </dl>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
