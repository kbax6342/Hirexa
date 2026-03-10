// /Hirexa/my-app/app/job-tools/agents/linkedin-outreach/LinkedInOutreachClient.tsx
"use client";

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowPathIcon,
  BoltIcon,
  BriefcaseIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  EnvelopeIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  UserCircleIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { Button } from "@/app/components/ui/button";
import {
  applyLeadTypeTemplate,
  generateDraftTemplate,
  interpolateTemplate,
  type ContactLeadType,
  parseCommaList,
} from "@/app/lib/agents/linkedinSim";

type LinkedInAccount = {
  id: string;
  provider?: string | null;
  email?: string | null;
  importedName?: string | null;
  importedHeadline?: string | null;
  importedLocation?: string | null;
  importedSkills: string[];
};

type Template = {
  id: string;
  name: string;
  body: string;
  isDefault: boolean;
};

type Campaign = {
  id: string;
  targetCompanies: string[];
  targetRoles: string[];
  targetTitles: string[];
  location: string | null;
  dailyLimit: number;
  autoFollowUp: boolean;
  followUpDays: number;
  tone: string;
  shortBio: string | null;
  templates: Template[];
};

type JobTarget = {
  id: string;
  jobId: string;
  company: string;
  title: string;
  location: string | null;
  source: string | null;
  status: string;
  leadsFound: number;
  messagesSent: number;
  updatedAt?: string;
};

type Lead = {
  id: string;
  outreachJobTargetId?: string | null;
  name: string;
  company: string;
  title: string;
  linkedinUrl?: string | null;
  contactEmail?: string | null;
  leadType?: ContactLeadType | null;
  confidence?: number | null;
  connectionLevel: string;
  status: string;
};

type Analytics = {
  leadsTotal: number;
  leadsReady: number;
  messagesSent: number;
  leadsReplied: number;
  pipelineJobs: number;
  activeCompanies: number;
};

type Notice = { type: "success" | "error"; text: string };

const emptyAnalytics: Analytics = {
  leadsTotal: 0,
  leadsReady: 0,
  messagesSent: 0,
  leadsReplied: 0,
  pipelineJobs: 0,
  activeCompanies: 0,
};

async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  if (!text) {
    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }
    return { ok: true } as const;
  }

  if (!contentType.toLowerCase().includes("application/json")) {
    if (!res.ok) {
      throw new Error(text || `Request failed (${res.status})`);
    }
    return { ok: true } as const;
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON response from server.");
  }

  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  return data;
}

function useNoticeTimer() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((next: Notice | null) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!next) {
      setNotice(null);
      return;
    }

    setNotice(next);
    timeoutRef.current = setTimeout(() => {
      setNotice(null);
      timeoutRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { notice, showNotice };
}

export default function LinkedInOutreachClient() {
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState<LinkedInAccount | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [jobTargets, setJobTargets] = useState<JobTarget[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>(emptyAnalytics);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { notice, showNotice } = useNoticeTimer();
  const { notice: templateNotice, showNotice: showTemplateNotice } = useNoticeTimer();
  const { notice: campaignNotice, showNotice: showCampaignNotice } = useNoticeTimer();
  const { notice: leadsNotice, showNotice: showLeadsNotice } = useNoticeTimer();

  const [companies, setCompanies] = useState("");
  const [roles, setRoles] = useState("");
  const [titles, setTitles] = useState("");
  const [location, setLocation] = useState("");
  const [dailyLimit, setDailyLimit] = useState(10);
  const [autoFollowUp, setAutoFollowUp] = useState(true);
  const [followUpDays, setFollowUpDays] = useState(5);
  const [tone, setTone] = useState("professional");
  const [shortBio, setShortBio] = useState("");

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState({ name: "", body: "", isDefault: false });
  const [newTemplateName, setNewTemplateName] = useState("New Template");
  const [newTemplateBody, setNewTemplateBody] = useState(
    "Hi {first_name},\n\nI wanted to introduce myself and learn more about {job_title} roles at {company}.\n\nBest,\n{user_name}"
  );
  const [defaultIntroCollapsed, setDefaultIntroCollapsed] = useState(false);
  const [newTemplateCollapsed, setNewTemplateCollapsed] = useState(false);

  const [previewLead, setPreviewLead] = useState<Lead | null>(null);
  const [sendingLeadId, setSendingLeadId] = useState<string | null>(null);
  const [jobTargetLoading, setJobTargetLoading] = useState<Record<string, boolean>>({});
  const [leadFilterJobTargetId, setLeadFilterJobTargetId] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [skillsDraft, setSkillsDraft] = useState("");
  const [skillsSaving, setSkillsSaving] = useState(false);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);

  const ensurePaid = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/plan-status", { cache: "no-store" });
      if (res.status === 401) {
        const nextUrl = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/login?next=${encodeURIComponent(nextUrl)}`;
        return false;
      }
      if (!res.ok) {
        throw new Error("Unable to verify subscription status.");
      }

      const data = await res.json();
      if (!data?.active) {
        const params = new URLSearchParams({ source: "linkedin-outreach" });
        window.location.href = `/checkout?${params.toString()}`;
        return false;
      }

      return true;
    } catch (err) {
      showNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Unable to verify subscription status.",
      });
      return false;
    }
  }, [showNotice]);

  const defaultTemplate = useMemo(
    () => campaign?.templates.find((template) => template.isDefault) ?? null,
    [campaign]
  );

  const selectedTemplate = useMemo(() => {
    if (!campaign?.templates?.length) return null;
    return (
      campaign.templates.find((template) => template.id === selectedTemplateId) ??
      defaultTemplate ??
      campaign.templates[0]
    );
  }, [campaign, defaultTemplate, selectedTemplateId]);

  const buildMessageForLead = useCallback(
    (lead: Lead) => {
      const templateBody =
        selectedTemplate?.body ??
        defaultTemplate?.body ??
        "Hi {first_name}, I'd love to connect about {job_title} roles at {company}.";

      const leadAwareBody = applyLeadTypeTemplate(templateBody, lead.leadType ?? null);

      return interpolateTemplate(
        leadAwareBody,
        {
          name: lead.name,
          company: lead.company,
          title: lead.title,
        },
        { shortBio: campaign?.shortBio ?? null },
        {
          importedName: account?.importedName ?? null,
          importedHeadline: account?.importedHeadline ?? null,
        }
      );
    },
    [
      account?.importedHeadline,
      account?.importedName,
      campaign?.shortBio,
      defaultTemplate?.body,
      selectedTemplate?.body,
    ]
  );

  const previewBody = useMemo(() => {
    if (!previewLead) return "";
    return buildMessageForLead(previewLead);
  }, [buildMessageForLead, previewLead]);

  const previewTemplateLabel =
    selectedTemplate?.name ?? defaultTemplate?.name ?? "Default Template";

  const refreshLeads = useCallback(async (jobTargetId: string | null) => {
    const params = new URLSearchParams({ take: "50", skip: "0" });
    if (jobTargetId) params.set("outreachJobTargetId", jobTargetId);

    const leadData = await fetchJson(`/api/agents/linkedin/leads?${params.toString()}`);
    setLeads(leadData.leads ?? []);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const linkedInError = params.get("linkedin_error");
    const linkedInOk = params.get("linkedin");

    if (linkedInError) {
      showNotice({
        type: "error",
        text: linkedInError === "missing_credentials"
          ? "LinkedIn OAuth is not configured."
          : "LinkedIn connection failed. Please try again.",
      });
      params.delete("linkedin_error");
      const nextQuery = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`
      );
    } else if (linkedInOk) {
      showNotice({ type: "success", text: "LinkedIn connected successfully." });
      params.delete("linkedin");
      const nextQuery = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`
      );
    }
  }, [showNotice]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const results = await Promise.allSettled([
      fetchJson("/api/agents/linkedin/connect"),
      fetchJson("/api/agents/linkedin/campaign"),
      fetchJson("/api/agents/linkedin/job-targets?take=25&skip=0"),
      fetchJson("/api/agents/linkedin/leads?take=50&skip=0"),
      fetchJson("/api/agents/linkedin/analytics"),
    ]);

    const connectResult = results[0];
    const campaignResult = results[1];
    const jobTargetsResult = results[2];
    const leadsResult = results[3];
    const analyticsResult = results[4];

    if (connectResult.status === "fulfilled") {
      setConnected(Boolean(connectResult.value?.connected));
      setAccount(connectResult.value?.account ?? null);
    }

    if (campaignResult.status === "fulfilled") {
      const campaignData = campaignResult.value?.campaign ?? null;
      setCampaign(campaignData);

      if (campaignData) {
        setCompanies(campaignData.targetCompanies.join(", "));
        setRoles(campaignData.targetRoles.join(", "));
        setTitles(campaignData.targetTitles.join(", "));
        setLocation(campaignData.location ?? "");
        setDailyLimit(campaignData.dailyLimit);
        setAutoFollowUp(campaignData.autoFollowUp);
        setFollowUpDays(campaignData.followUpDays);
        setTone(campaignData.tone ?? "professional");
        setShortBio(campaignData.shortBio ?? "");
      }
    }

    if (jobTargetsResult.status === "fulfilled") {
      setJobTargets(jobTargetsResult.value?.jobTargets ?? []);
    }

    if (leadsResult.status === "fulfilled") {
      setLeads(leadsResult.value?.leads ?? []);
    }

    const pipelineJobs =
      jobTargetsResult.status === "fulfilled"
        ? (jobTargetsResult.value?.total ?? jobTargetsResult.value?.jobTargets?.length ?? 0)
        : 0;

    const activeCompanies =
      jobTargetsResult.status === "fulfilled"
        ? new Set(
            (jobTargetsResult.value?.jobTargets ?? []).map((job: JobTarget) =>
              job.company.toLowerCase()
            )
          ).size
        : 0;

    if (analyticsResult.status === "fulfilled") {
      const apiAnalytics = analyticsResult.value?.analytics ?? {};
      setAnalytics({
        leadsTotal: apiAnalytics.leadsTotal ?? 0,
        leadsReady: apiAnalytics.leadsReady ?? 0,
        messagesSent: apiAnalytics.messagesSent ?? 0,
        leadsReplied: apiAnalytics.leadsReplied ?? 0,
        pipelineJobs,
        activeCompanies,
      });
    } else {
      setAnalytics((prev) => ({ ...prev, pipelineJobs, activeCompanies }));
    }

    if (
      connectResult.status === "rejected" ||
      campaignResult.status === "rejected" ||
      jobTargetsResult.status === "rejected" ||
      leadsResult.status === "rejected" ||
      analyticsResult.status === "rejected"
    ) {
      setError("Some Outreach Copilot data could not be loaded.");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!campaign?.templates?.length) {
      setSelectedTemplateId(null);
      return;
    }

    setSelectedTemplateId((current) => {
      if (current && campaign.templates.some((template) => template.id === current)) {
        return current;
      }

      return (
        campaign.templates.find((template) => template.isDefault)?.id ?? campaign.templates[0].id
      );
    });
  }, [campaign?.templates]);

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateDraft({ name: "", body: "", isDefault: false });
      return;
    }

    setTemplateDraft({
      name: selectedTemplate.name,
      body: selectedTemplate.body,
      isDefault: selectedTemplate.isDefault,
    });
  }, [selectedTemplate]);

  useEffect(() => {
    setSkillsDraft((account?.importedSkills ?? []).join(", "));
  }, [account]);

  const handleConnectToggle = async () => {
    if (connectLoading) return;
    if (!(await ensurePaid())) return;
    try {
      setConnectLoading(true);
      if (connected) {
        await fetchJson("/api/agents/linkedin/connect", { method: "DELETE" });
        showNotice({ type: "success", text: "Disconnected Outreach Copilot profile." });
      } else {
        window.location.href = "/api/agents/linkedin/oauth/start";
        return;
      }

      await refreshAll();
    } catch (err) {
      showNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update connection.",
      });
    } finally {
      setConnectLoading(false);
    }
  };

  const handleSaveSkills = async () => {
    if (skillsSaving || !connected) return;
    if (!(await ensurePaid())) return;
    try {
      setSkillsSaving(true);
      const importedSkills = parseCommaList(skillsDraft);
      const result = await fetchJson("/api/agents/linkedin/connect", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importedSkills }),
      });
      setAccount(result.account ?? account);
      showNotice({ type: "success", text: "Skills updated." });
    } catch (err) {
      showNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update skills.",
      });
    } finally {
      setSkillsSaving(false);
    }
  };

  const handleRefreshProfile = async () => {
    if (!connected || refreshLoading) return;
    if (!(await ensurePaid())) return;

    try {
      setRefreshLoading(true);
      await fetchJson("/api/agents/linkedin/oauth/refresh", { method: "POST" });
      await refreshAll();
      showNotice({ type: "success", text: "LinkedIn profile refreshed." });
    } catch (err) {
      showNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to refresh profile.",
      });
    } finally {
      setRefreshLoading(false);
    }
  };

  const handleDiscoverLeads = async () => {
    if (!(await ensurePaid())) return;
    try {
      await fetchJson("/api/agents/linkedin/leads/discover", { method: "POST" });
      await refreshAll();
      showLeadsNotice({ type: "success", text: "New leads discovered." });
    } catch (err) {
      showLeadsNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to discover leads.",
      });
    }
  };

  const handleSaveCampaign = async () => {
    if (!(await ensurePaid())) return;
    try {
      await fetchJson("/api/agents/linkedin/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetCompanies: parseCommaList(companies),
          targetRoles: parseCommaList(roles),
          targetTitles: parseCommaList(titles),
          location,
          dailyLimit,
          autoFollowUp,
          followUpDays,
          tone,
          shortBio,
        }),
      });

      await refreshAll();
      showCampaignNotice({ type: "success", text: "Campaign saved." });
    } catch (err) {
      showCampaignNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save campaign.",
      });
    }
  };

  const handleSmarterDraft = async () => {
    if (!(await ensurePaid())) return;
    const focusCompany = parseCommaList(companies)[0] ?? "your company";
    const focusTitle = parseCommaList(titles)[0] ?? parseCommaList(roles)[0] ?? "the role";

    const draft = generateDraftTemplate({
      tone: (tone as "professional" | "friendly" | "confident") ?? "professional",
      shortBio: shortBio || undefined,
      importedName: account?.importedName ?? null,
      importedHeadline: account?.importedHeadline ?? null,
      importedSkills: account?.importedSkills ?? [],
      company: focusCompany,
      jobTitle: focusTitle,
    });

    setNewTemplateName("Smarter Draft");
    setNewTemplateBody(draft);
    showTemplateNotice({ type: "success", text: "Smarter draft generated." });
  };

  const handleCreateTemplate = async () => {
    if (!(await ensurePaid())) return;
    try {
      await fetchJson("/api/agents/linkedin/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          body: newTemplateBody,
        }),
      });

      await refreshAll();
      showTemplateNotice({ type: "success", text: "Template created." });
    } catch (err) {
      showTemplateNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create template.",
      });
    }
  };

  const handleSaveTemplate = async () => {
    if (!selectedTemplate) return;
    if (!(await ensurePaid())) return;

    try {
      await fetchJson("/api/agents/linkedin/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedTemplate.id,
          name: templateDraft.name,
          body: templateDraft.body,
          isDefault: templateDraft.isDefault,
        }),
      });

      await refreshAll();
      showTemplateNotice({ type: "success", text: "Template updated." });
    } catch (err) {
      showTemplateNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update template.",
      });
    }
  };

  const handleSetDefaultTemplate = async () => {
    if (!selectedTemplate) return;
    if (!(await ensurePaid())) return;

    try {
      await fetchJson("/api/agents/linkedin/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedTemplate.id,
          name: templateDraft.name,
          body: templateDraft.body,
          isDefault: true,
        }),
      });

      await refreshAll();
      showTemplateNotice({ type: "success", text: "Default template updated." });
    } catch (err) {
      showTemplateNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to set default.",
      });
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;
    if (!(await ensurePaid())) return;

    try {
      await fetchJson("/api/agents/linkedin/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedTemplate.id }),
      });

      await refreshAll();
      showTemplateNotice({ type: "success", text: "Template deleted." });
    } catch (err) {
      showTemplateNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete template.",
      });
    }
  };

  const handleSendMessage = async (lead: Lead, overrideBody?: string) => {
    if (!lead.id) return;
    if (!(await ensurePaid())) return false;

    try {
      setSendingLeadId(lead.id);

      await fetchJson("/api/agents/linkedin/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          templateId: selectedTemplate?.id ?? defaultTemplate?.id,
          body: overrideBody,
        }),
      });

      await refreshAll();
      showLeadsNotice({ type: "success", text: `Message sent to ${lead.name}.` });
      return true;
    } catch (err) {
      showLeadsNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to send message.",
      });
      return false;
    } finally {
      setSendingLeadId(null);
    }
  };

  const handleSendPreview = async () => {
    if (!previewLead) return;
    if (!(await ensurePaid())) return;
    const success = await handleSendMessage(previewLead, previewBody);
    if (success) setPreviewLead(null);
  };

  const handleDiscoverForJob = async (jobTarget: JobTarget) => {
    if (!(await ensurePaid())) return;
    setJobTargetLoading((prev) => ({ ...prev, [jobTarget.id]: true }));

    try {
      await fetchJson("/api/agents/linkedin/leads/discover/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTargetId: jobTarget.id }),
      });

      await refreshAll();
      showLeadsNotice({ type: "success", text: `Leads added for ${jobTarget.company}.` });
    } catch (err) {
      showLeadsNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to discover leads.",
      });
    } finally {
      setJobTargetLoading((prev) => ({ ...prev, [jobTarget.id]: false }));
    }
  };

  const handleViewLeads = async (jobTargetId: string | null) => {
    if (!(await ensurePaid())) return;
    setLeadFilterJobTargetId(jobTargetId);
    await refreshLeads(jobTargetId);
  };

  const handleDeleteLead = async (lead: Lead) => {
    if (deletingLeadId) return;
    if (!(await ensurePaid())) return;
    try {
      setDeletingLeadId(lead.id);
      await fetchJson(`/api/agents/linkedin/leads?leadId=${encodeURIComponent(lead.id)}`, {
        method: "DELETE",
      });

      setLeads((prev) => prev.filter((item) => item.id !== lead.id));

      if (lead.outreachJobTargetId) {
        setJobTargets((prev) =>
          prev.map((job) =>
            job.id === lead.outreachJobTargetId
              ? { ...job, leadsFound: Math.max(0, job.leadsFound - 1) }
              : job
          )
        );
      }

      setAnalytics((prev) => ({
        ...prev,
        leadsTotal: Math.max(0, prev.leadsTotal - 1),
        leadsReady:
          lead.status === "READY"
            ? Math.max(0, prev.leadsReady - 1)
            : prev.leadsReady,
        leadsReplied:
          lead.status === "REPLIED"
            ? Math.max(0, prev.leadsReplied - 1)
            : prev.leadsReplied,
      }));

      showLeadsNotice({ type: "success", text: `Removed ${lead.name}.` });
    } catch (err) {
      showLeadsNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to remove lead.",
      });
    } finally {
      setDeletingLeadId(null);
    }
  };

  const handleOpenLeadUrl = async (lead: Lead) => {
    if (!(await ensurePaid())) return;
    if (!lead.linkedinUrl) return;
    window.open(lead.linkedinUrl, "_blank", "noopener,noreferrer");
  };

  const handleCopyLeadEmail = async (lead: Lead) => {
    if (!(await ensurePaid())) return;
    if (!lead.contactEmail) return;
    try {
      await navigator.clipboard.writeText(lead.contactEmail);
      showLeadsNotice({ type: "success", text: "Email copied." });
    } catch {
      showLeadsNotice({ type: "error", text: "Failed to copy email." });
    }
  };

  const handleCopyLeadMessage = async (lead: Lead) => {
    if (!(await ensurePaid())) return;
    try {
      const message = buildMessageForLead(lead);
      await navigator.clipboard.writeText(message);
      showLeadsNotice({ type: "success", text: "Message copied." });
    } catch {
      showLeadsNotice({ type: "error", text: "Failed to copy message." });
    }
  };

  const handlePreviewLead = async (lead: Lead) => {
    if (!(await ensurePaid())) return;
    setPreviewLead(lead);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <Card>
            <div className="h-6 w-40 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-4 w-64 animate-pulse rounded bg-slate-100" />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        ) : null}

        {notice ? <InlineNotice type={notice.type}>{notice.text}</InlineNotice> : null}

        <Card className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
              <SparklesIcon className="h-5 w-5" />
              Outreach Copilot
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Outreach Copilot</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Turn your top Smart Matches into personalized recruiter outreach campaigns. Connect
              LinkedIn to power outreach sequences and pipeline tracking in one premium workflow.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleConnectToggle}
              variant={connected ? "outline" : "default"}
              disabled={connectLoading}
            >
              {connectLoading
                ? connected
                  ? "Disconnecting..."
                  : "Connecting..."
                : connected
                  ? "Disconnect"
                  : "Connect Profile"}
            </Button>
            <Button variant="outline" onClick={handleDiscoverLeads}>
              Discover Leads
            </Button>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <SectionTitle
              icon={<UserCircleIcon className="h-5 w-5 text-slate-700" />}
              title="Connection & Profile"
              subtitle="LinkedIn OAuth connection used for personalization."
            />

            <div className="mt-4 flex items-center gap-2">
              <StatusPill
                tone={connected ? "success" : "neutral"}
                label={connected ? "Connected (LinkedIn)" : "Not connected"}
              />
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <InfoRow label="Name" value={account?.importedName ?? "—"} />
              <InfoRow label="Location" value={account?.importedLocation ?? "—"} />
              {account?.email ? <InfoRow label="Email" value={account.email} /> : null}
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Skills
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(account?.importedSkills ?? []).length > 0 ? (
                  account?.importedSkills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600"
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">
                    No skills imported yet. Add your skills below to personalize outreach.
                  </span>
                )}
              </div>
              {connected ? (
                <div className="mt-3 space-y-2">
                  <Field
                    label="Add skills (comma-separated)"
                    value={skillsDraft}
                    onChange={setSkillsDraft}
                    placeholder="Product Management, SQL, User Research"
                    multiline
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSaveSkills}
                      disabled={skillsSaving}
                    >
                      {skillsSaving ? "Saving..." : "Save Skills"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-400">
                  Connect LinkedIn to load and edit skills.
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={handleConnectToggle}
                variant={connected ? "outline" : "default"}
                disabled={connectLoading}
              >
                {connectLoading
                  ? connected
                    ? "Disconnecting..."
                    : "Connecting..."
                  : connected
                    ? "Disconnect"
                    : "Connect LinkedIn"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefreshProfile}
                disabled={!connected || refreshLoading}
              >
                {refreshLoading ? "Refreshing..." : "Refresh Profile"}
              </Button>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <SectionTitle
              icon={<BoltIcon className="h-5 w-5 text-slate-700" />}
              title="Campaign Builder"
              subtitle="Define targets and automation rules for Outreach Copilot."
            />

            {campaignNotice ? (
              <InlineNotice type={campaignNotice.type} className="mt-3">
                {campaignNotice.text}
              </InlineNotice>
            ) : null}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field
                label="Target companies"
                placeholder="Stripe, OpenAI"
                value={companies}
                onChange={setCompanies}
                multiline
              />
              <Field
                label="Target roles"
                placeholder="Engineering, Data"
                value={roles}
                onChange={setRoles}
                multiline
              />
              <Field
                label="Target titles"
                placeholder="Software Engineer, Product Manager"
                value={titles}
                onChange={setTitles}
                multiline
              />
              <Field
                label="Location focus"
                placeholder="San Francisco Bay Area"
                value={location}
                onChange={setLocation}
              />
              <Field
                label="Daily outreach limit"
                type="number"
                value={String(dailyLimit)}
                onChange={(value) => setDailyLimit(Number(value) || 1)}
              />

              <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Follow-up settings
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={autoFollowUp}
                    onChange={(event) => setAutoFollowUp(event.target.checked)}
                  />
                  Auto follow-up
                </label>
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  Follow-up days
                  <input
                    className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm"
                    type="number"
                    min={1}
                    value={followUpDays}
                    onChange={(event) => setFollowUpDays(Number(event.target.value) || 1)}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-black">
                  Tone
                </div>
                <select
                  className="mt-2 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-black"
                  value={tone}
                  onChange={(event) => setTone(event.target.value)}
                >
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="confident">Confident</option>
                </select>
              </div>

              <Field
                label="Short bio"
                placeholder="A quick intro used in personalized messages."
                value={shortBio}
                onChange={setShortBio}
                multiline
                rows={3}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={handleSaveCampaign}>
                <ClipboardDocumentCheckIcon className="mr-2 h-4 w-4" />
                Save Campaign
              </Button>
              <Button variant="outline" onClick={handleSmarterDraft}>
                <SparklesIcon className="mr-2 h-4 w-4" />
                Smarter Draft
              </Button>
            </div>
          </Card>
        </div>

        <Card>
          <SectionTitle
            icon={<SparklesIcon className="h-5 w-5 text-slate-700" />}
            title="Templates"
            subtitle="Create, edit, and manage message templates."
          />

          {templateNotice ? (
            <InlineNotice type={templateNotice.type} className="mt-3">
              {templateNotice.text}
            </InlineNotice>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-[280px,1fr]">
            <div className="space-y-2">
              {campaign?.templates?.length ? (
                campaign.templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                      template.id === selectedTemplate?.id
                        ? "border-slate-400 bg-slate-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">{template.name}</span>
                      {template.isDefault ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Default
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{template.body}</p>
                  </button>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  No templates yet. Save a campaign to auto-create one.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-800">
                  Default Edit Template
                </div>
                {selectedTemplate?.isDefault ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-600 transition hover:text-slate-800"
                    onClick={() => setDefaultIntroCollapsed((prev) => !prev)}
                  >
                    {defaultIntroCollapsed ? "Expand Default Intro" : "Collapse Default Intro"}
                  </button>
                ) : null}
              </div>
              {selectedTemplate ? (
                defaultIntroCollapsed && selectedTemplate.isDefault ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Default intro collapsed. Expand to edit.
                  </p>
                ) : (
                  <>
                    <Field
                      label="Template name"
                      value={templateDraft.name}
                      onChange={(value) => setTemplateDraft((prev) => ({ ...prev, name: value }))}
                    />
                    <Field
                      label="Template body"
                      value={templateDraft.body}
                      onChange={(value) => setTemplateDraft((prev) => ({ ...prev, body: value }))}
                      multiline
                      rows={6}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={handleSaveTemplate}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleSetDefaultTemplate}>
                        Set Default
                      </Button>
                      <Button size="sm" variant="ghost" onClick={handleDeleteTemplate}>
                        Delete
                      </Button>
                    </div>
                  </>
                )
              ) : (
                <p className="mt-2 text-sm text-slate-500">Select a template to edit.</p>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-800">Create New Template</div>
              <button
                type="button"
                className="text-xs font-semibold text-slate-600 transition hover:text-slate-800"
                onClick={() => setNewTemplateCollapsed((prev) => !prev)}
              >
                {newTemplateCollapsed ? "Expand" : "Collapse"}
              </button>
            </div>
            {newTemplateCollapsed ? (
              <p className="mt-2 text-xs text-slate-500">
                New template form collapsed. Expand to create a template.
              </p>
            ) : (
              <>
                <Field label="Name" value={newTemplateName} onChange={setNewTemplateName} />
                <Field
                  label="Body"
                  value={newTemplateBody}
                  onChange={setNewTemplateBody}
                  multiline
                  rows={6}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={handleCreateTemplate}>
                    Create Template
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleSmarterDraft}>
                    Generate Smarter Draft
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle
            icon={<BriefcaseIcon className="h-5 w-5 text-slate-700" />}
            title="Jobs in Outreach Pipeline"
            subtitle="Smart Matches promoted into Outreach Copilot."
          />

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2">Title</th>
                  <th className="pb-2">Company</th>
                  <th className="pb-2">Source</th>
                  <th className="pb-2">Leads</th>
                  <th className="pb-2">Messages</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobTargets.map((job) => (
                  <tr key={job.id} className="border-t border-slate-100">
                    <td className="py-3 font-medium text-slate-800">{job.title}</td>
                    <td className="py-3 text-slate-600">{job.company}</td>
                    <td className="py-3 text-slate-500">{job.source ?? "—"}</td>
                    <td className="py-3 text-slate-600">{job.leadsFound}</td>
                    <td className="py-3 text-slate-600">{job.messagesSent}</td>
                    <td className="py-3">
                      <StatusPill label={job.status} tone="neutral" />
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleDiscoverForJob(job)}
                          disabled={jobTargetLoading[job.id]}
                        >
                          {jobTargetLoading[job.id] ? "Working..." : "Discover Leads"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleViewLeads(job.id)}
                        >
                          View Leads
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {jobTargets.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                No pipeline jobs yet. Add a Smart Match to Outreach Copilot from the dashboard.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <SectionTitle
            icon={<UsersIcon className="h-5 w-5 text-slate-700" />}
            title="Contact Leads"
            subtitle="Review contact paths, preview messages, and send outreach."
          />

          {leadsNotice ? (
            <InlineNotice type={leadsNotice.type} className="mt-3">
              {leadsNotice.text}
            </InlineNotice>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleDiscoverLeads}>
              Discover Leads
            </Button>
            {leadFilterJobTargetId ? (
              <Button variant="ghost" onClick={() => void handleViewLeads(null)}>
                Clear Job Filter
              </Button>
            ) : null}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Company</th>
                  <th className="pb-2">Title</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Confidence</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-t border-slate-100">
                    <td className="py-3 font-medium text-slate-800">{lead.name}</td>
                    <td className="py-3 text-slate-600">{lead.company}</td>
                    <td className="py-3 text-slate-600">{lead.title}</td>
                    <td className="py-3 text-slate-500">
                      {formatLeadType(lead.leadType)}
                    </td>
                    <td className="py-3 text-slate-600">
                      {typeof lead.confidence === "number" ? `${lead.confidence}%` : "—"}
                    </td>
                    <td className="py-3">
                      <StatusPill
                        label={lead.status}
                        tone={lead.status === "READY" ? "success" : "neutral"}
                      />
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        {lead.linkedinUrl ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenLeadUrl(lead)}
                          >
                            {lead.leadType === "company_contact_form"
                              ? "Open Contact Form"
                              : lead.leadType === "careers_page_contact"
                                ? "Open Careers Page"
                                : lead.leadType === "company_recruiting_email" ||
                                  lead.leadType === "company_support_inbox"
                                  ? "Open Email"
                                  : "Open LinkedIn Search"}
                          </Button>
                        ) : null}
                        {lead.contactEmail ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleCopyLeadEmail(lead)}
                          >
                            Copy Email
                          </Button>
                        ) : null}
                        <Button size="sm" variant="outline" onClick={() => void handlePreviewLead(lead)}>
                          Preview Message
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void handleCopyLeadMessage(lead)}>
                          Copy Message
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void handleSendMessage(lead)}
                          disabled={sendingLeadId === lead.id}
                        >
                          <PaperAirplaneIcon className="mr-1 h-4 w-4" />
                          {sendingLeadId === lead.id ? "Sending..." : "Send"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleDeleteLead(lead)}
                          disabled={deletingLeadId === lead.id}
                          className="text-black hover:text-black"
                        >
                          <XMarkIcon className="mr-1 h-4 w-4" />
                          {deletingLeadId === lead.id ? "Removing..." : "Remove"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {leads.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                No contact leads yet. Discover leads to kick off outreach.
              </p>
            ) : null}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <SectionTitle
              icon={<CheckBadgeIcon className="h-5 w-5 text-slate-700" />}
              title="Analytics"
              subtitle="Track Outreach Copilot momentum."
            />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Stat
                label="Total Leads"
                value={analytics.leadsTotal}
                icon={<UsersIcon className="h-4 w-4" />}
              />
              <Stat
                label="Ready Leads"
                value={analytics.leadsReady}
                icon={<CheckCircleIcon className="h-4 w-4" />}
              />
              <Stat
                label="Messages Sent"
                value={analytics.messagesSent}
                icon={<PaperAirplaneIcon className="h-4 w-4" />}
              />
              <Stat
                label="Replies"
                value={analytics.leadsReplied}
                icon={<EnvelopeIcon className="h-4 w-4" />}
              />
              <Stat
                label="Pipeline Jobs"
                value={analytics.pipelineJobs}
                icon={<BriefcaseIcon className="h-4 w-4" />}
              />
              <Stat
                label="Active Companies"
                value={analytics.activeCompanies}
                icon={<BoltIcon className="h-4 w-4" />}
              />
            </div>
          </Card>

          <Card>
            <SectionTitle
              icon={<ArrowPathIcon className="h-5 w-5 text-slate-700" />}
              title="How It Works"
              subtitle="Outreach Copilot workflow at a glance."
            />
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <Step
                title="Connect your LinkedIn profile"
                text="We import your LinkedIn identity to personalize every message."
              />
              <Step
                title="Build a campaign"
                text="Define target companies, roles, titles, and outreach limits."
              />
              <Step
                title="Promote Smart Matches"
                text="Send your best matches into the outreach pipeline with one click."
              />
              <Step
                title="Discover leads & send messages"
                text="Generate recruiters, preview messages, and send outreach."
              />
            </div>
          </Card>
        </div>
      </div>

      {previewLead ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Message Preview</h3>
              <button
                type="button"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
                onClick={() => setPreviewLead(null)}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Using <span className="font-semibold text-slate-800">{previewTemplateLabel}</span>{" "}
              for <span className="font-semibold text-slate-800">{previewLead.name}</span>
            </div>

            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{previewBody}</p>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPreviewLead(null)}>
                Close
              </Button>
              <Button onClick={handleSendPreview} disabled={sendingLeadId === previewLead.id}>
                <PaperAirplaneIcon className="mr-1 h-4 w-4" />
                {sendingLeadId === previewLead.id ? "Sending..." : "Send Message"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className ?? ""}`}
    >
      {children}
    </section>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        {icon}
        {title}
      </div>
      {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  multiline,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      {multiline ? (
        <textarea
          className="rounded-xl border border-slate-200 bg-white p-2 text-sm font-normal text-slate-700"
          placeholder={placeholder}
          value={value}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className="rounded-xl border border-slate-200 bg-white p-2 text-sm font-normal text-slate-700"
          placeholder={placeholder}
          value={value}
          type={type}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-700">{value}</span>
    </div>
  );
}

function formatLeadType(type?: string | null) {
  switch (type) {
    case "recruiter_search":
      return "Recruiter Search";
    case "hiring_manager_search":
      return "Hiring Manager Search";
    case "company_recruiting_email":
      return "Recruiting Email";
    case "company_contact_form":
      return "Contact Form";
    case "careers_page_contact":
      return "Careers Page";
    case "company_support_inbox":
      return "Support Inbox";
    default:
      return "Contact Lead";
  }
}

function StatusPill({ label, tone }: { label: string; tone: "success" | "neutral" }) {
  const base =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${base}`}>
      {label}
    </span>
  );
}

function InlineNotice({
  type,
  className,
  children,
}: {
  type: "success" | "error";
  className?: string;
  children: ReactNode;
}) {
  const tone =
    type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-red-200 bg-red-50 text-red-700";

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${tone} ${className ?? ""}`}>
      {children}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function Step({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      <p className="mt-1 text-xs text-slate-600">{text}</p>
    </div>
  );
}
