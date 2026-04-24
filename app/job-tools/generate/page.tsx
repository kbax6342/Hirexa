// /Hirexa/my-app/app/(no-nav)/job-tools/generate/page.tsx
"use client";

import Link from "next/link";
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  normalizeCoverLetter,
  normalizedCoverLetterToText,
} from "@/app/lib/documents/normalizeCoverLetter";
import {
  normalizeResume,
  normalizedResumeToText,
} from "@/app/lib/documents/normalizeResume";
import AppliedJobsPopout from "@/app/components/apply/AppliedJobsPopout";
import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
  ClipboardIcon,
  CloudArrowUpIcon,
  LinkIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "@heroicons/react/24/solid";

type Result = {
  candidateName?: string | null;
  candidateFirstName?: string | null;
  candidateLastName?: string | null;
  candidateEmail?: string | null;
  savedResume?: {
    id: string;
    fileName?: string | null;
  };
  credits?: {
    remaining: number;
    starterRemaining: number;
    starterGranted: boolean;
    consumed: boolean;
  };
  profileSync?: {
    updatedFields: string[];
    skippedFields: string[];
  };
  job: {
    title?: string;
    company?: string;
    location?: string;
    summary?: string;
    keyRequirements?: string[];
  };
  coverLetter: string;
  fullResumeText?: string;
  resumeUpdates: {
    summaryRewrite?: string;
    skillsToAdd?: string[];
    bulletEdits?: Array<{ section: string; before: string; after: string }>;
    atsKeywords?: string[];
  };
  emails: {
    beforeInterview: string;
    afterInterview: string;
  };
};

type Tone = "professional" | "conversational" | "enthusiastic";
type LlmProvider = "auto" | "openai" | "claude" | "gemini";
type TabKey = "coverLetter" | "updatedResume" | "preInterview" | "postInterview";
type DownloadFormat = "pdf" | "txt" | "docx";
type PlanStatusResponse = {
  ok?: boolean;
  userId?: string | null;
  active?: boolean;
  pending?: boolean;
  accessState?: "active" | "pending" | "inactive";
  planType?: string | null;
  planStatus?: string | null;
  trialSubscriber?: boolean;
  monthlySubscriber?: boolean;
  yearlySubscriber?: boolean;
  trialPlanStatus?: string | null;
  monthlyPlanStatus?: string | null;
  yearlyPlanStatus?: string | null;
};

type CreditStatusResponse = {
  hasHirePilotAccess?: boolean;
  hirePilotUnlimited?: boolean;
  hirePilotCredits?: number;
  monthlyCredits?: number;
  rolloverCredits?: number;
  starterCredits?: number;
  starterCreditsGranted?: boolean;
  purchasedCredits?: number;
};

type ResultCompatibilityFields = {
  revisedResume?: string;
  updatedResume?: string;
  preInterview?: string;
  preInterviewEmail?: string;
  postInterview?: string;
  postInterviewEmail?: string;
  emails?: {
    beforeInterview?: string;
    afterInterview?: string;
    preInterview?: string;
    preInterviewEmail?: string;
    postInterview?: string;
    postInterviewEmail?: string;
  };
};

const textEncoder = new TextEncoder();

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "coverLetter", label: "Cover Letter" },
  { key: "updatedResume", label: "Revised Resume" },
  { key: "preInterview", label: "Pre-Interview Email" },
  { key: "postInterview", label: "Post Interview Email" },
];
const allDocTabs: TabKey[] = ["coverLetter", "updatedResume", "preInterview", "postInterview"];

function createEmptyEditableDocs(): Record<TabKey, string | null> {
  return {
    coverLetter: null,
    updatedResume: null,
    preInterview: null,
    postInterview: null,
  };
}

const focusOptions = [
  { key: "technical", label: "Technical Skills" },
  { key: "leadership", label: "Leadership Experience" },
  { key: "projects", label: "Project Achievements" },
] as const;
const llmProviderOptions: Array<{ value: LlmProvider; label: string }> = [
  { value: "auto", label: "Auto / Recommended" },
  { value: "openai", label: "OpenAI" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
];

function JobToolsGeneratePageContent() {
  const searchParams = useSearchParams();
  const [url, setUrl] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [pastedJobText, setPastedJobText] = useState("");

  const [tone, setTone] = useState<Tone>("professional");
  const [focus, setFocus] = useState<Record<(typeof focusOptions)[number]["key"], boolean>>({
    technical: true,
    leadership: false,
    projects: false,
  });

  const [instructions, setInstructions] = useState("");
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("auto");

  const [activeTab, setActiveTab] = useState<TabKey>("coverLetter");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [editableDocs, setEditableDocs] = useState<Record<TabKey, string | null>>(
    createEmptyEditableDocs()
  );
  const [planStatus, setPlanStatus] = useState<PlanStatusResponse | null>(null);
  const [creditStatus, setCreditStatus] = useState<CreditStatusResponse | null>(null);
  const [accessStatusLoading, setAccessStatusLoading] = useState(true);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeDocumentTitleRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusGeneratedCoverLetterRef = useRef(false);
  const downloadMenuRef = useRef<HTMLDivElement | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const prefillUrl = searchParams.get("jobUrl")?.trim();
    if (!prefillUrl) return;
    if (!url) setUrl(prefillUrl);
  }, [searchParams, url]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadAccessStatus() {
      try {
        const [planRes, creditRes] = await Promise.all([
          fetch("/api/billing/plan-status", {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch("/api/user/hirepilot-status", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);

        if (!active) return;

        if (planRes.ok) {
          setPlanStatus((await planRes.json()) as PlanStatusResponse);
        } else if (planRes.status === 401) {
          setPlanStatus(null);
        }

        if (creditRes.ok) {
          setCreditStatus((await creditRes.json()) as CreditStatusResponse);
        } else if (creditRes.status === 401) {
          setCreditStatus(null);
        }
      } catch {
        if (active) {
          setPlanStatus(null);
          setCreditStatus(null);
        }
      } finally {
        if (active) {
          setAccessStatusLoading(false);
        }
      }
    }

    void loadAccessStatus();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!result || activeTab !== "coverLetter") return;
    if (!shouldFocusGeneratedCoverLetterRef.current) return;

    const target = activeDocumentTitleRef.current;
    if (!target) return;

    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.focus({ preventScroll: true });
      shouldFocusGeneratedCoverLetterRef.current = false;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, result]);

  useEffect(() => {
    if (!downloadMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!downloadMenuRef.current) return;
      if (!downloadMenuRef.current.contains(event.target as Node)) {
        setDownloadMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDownloadMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [downloadMenuOpen]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
        copyResetTimeoutRef.current = null;
      }
    };
  }, []);

  const canSubmit = useMemo(() => {
    try {
      const u = new URL(url.trim());
      return ["http:", "https:"].includes(u.protocol);
    } catch {
      return false;
    }
  }, [url]);

  const hasFallbackText = pastedJobText.trim().length >= 150;

  function toggleFocus(k: (typeof focusOptions)[number]["key"]) {
    setFocus((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  function resetAll() {
    setUrl("");
    setResumeFile(null);
    setTone("professional");
    setPastedJobText("");
    setFocus({ technical: true, leadership: false, projects: false });
    setInstructions("");
    setLlmProvider("auto");
    setActiveTab("coverLetter");
    setError(null);
    setResult(null);
    setEditableDocs(createEmptyEditableDocs());
  }

  function pickFirstNonEmpty(...values: Array<string | null | undefined>) {
    for (const value of values) {
      const normalized = String(value ?? "").trim();
      if (normalized) return value ?? "";
    }
    return "";
  }

  function normalizeDocumentText(value: string) {
    return value
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function getCandidateName(r: Result | null) {
    if (!r) return "";
    return (
      r.candidateName?.trim() ||
      [r.candidateFirstName?.trim(), r.candidateLastName?.trim()].filter(Boolean).join(" ").trim()
    );
  }

  function getJobCompany(r: Result | null) {
    return r?.job?.company?.trim() || "";
  }

  function getJobTitle(r: Result | null) {
    return r?.job?.title?.trim() || "";
  }

  function stripPlaceholders(
    value: string,
    context: {
      candidateName: string;
      company: string;
      role: string;
      dateLabel: string;
    }
  ) {
    const replacements: Array<{ pattern: RegExp; replacement: string }> = [
      {
        pattern: /\[(your name|candidate name|name)\]/gi,
        replacement: context.candidateName,
      },
      {
        pattern: /\[(company|company name)\]/gi,
        replacement: context.company,
      },
      {
        pattern: /\[(hiring manager|recruiter|interviewer)\]/gi,
        replacement: "Hiring Team",
      },
      {
        pattern: /\[(date)\]/gi,
        replacement: context.dateLabel,
      },
      {
        pattern: /\[(role|job title|position)\]/gi,
        replacement: context.role,
      },
    ];

    let normalized = String(value ?? "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/_(.*?)_/g, "$1")
      .replace(/\b(undefined|null)\b/gi, "");

    for (const { pattern, replacement } of replacements) {
      normalized = normalized.replace(pattern, replacement || "");
    }

    if (context.candidateName) {
      normalized = normalized.replace(/\bcandidate\b/gi, context.candidateName);
    }

    normalized = normalized.replace(/\[(?:[^\]]+)\]/g, "");
    return normalizeDocumentText(normalized);
  }

  function splitParagraphs(value: string) {
    return normalizeDocumentText(value)
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
  }

  function dedupeTextItems(values: string[]) {
    const seen = new Set<string>();
    const items: string[] = [];

    for (const value of values) {
      const normalized = normalizeDocumentText(value);
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(normalized);
    }

    return items;
  }

  function getRawDocumentText(r: Result | null, tab: TabKey) {
    if (!r) return "";
    const compatibility = r as Result & ResultCompatibilityFields;

    if (tab === "coverLetter") {
      return pickFirstNonEmpty(r.coverLetter);
    }
    if (tab === "preInterview") {
      return pickFirstNonEmpty(
        r.emails?.beforeInterview,
        compatibility.preInterviewEmail,
        compatibility.preInterview,
        compatibility.emails?.preInterviewEmail,
        compatibility.emails?.preInterview
      );
    }
    if (tab === "postInterview") {
      return pickFirstNonEmpty(
        r.emails?.afterInterview,
        compatibility.postInterviewEmail,
        compatibility.postInterview,
        compatibility.emails?.postInterviewEmail,
        compatibility.emails?.postInterview
      );
    }

    return pickFirstNonEmpty(
      r.fullResumeText,
      compatibility.revisedResume,
      compatibility.updatedResume
    );
  }

  function formatCoverLetterDocument(r: Result | null) {
    if (!r) return "";
    const candidateName = getCandidateName(r);
    const company = getJobCompany(r);
    const dateLabel = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date());
    const role = getJobTitle(r);
    const context = { candidateName, company, role, dateLabel };
    const rawCoverLetter = stripPlaceholders(
      getRawDocumentText(r, "coverLetter"),
      context
    );
    const normalized = normalizeCoverLetter({
      rawText: rawCoverLetter,
      candidateName: candidateName || null,
      candidateContactLines: dedupeTextItems([r.candidateEmail ?? ""]),
      company: company || null,
      dateLine: dateLabel,
      defaultGreeting: "Dear Hiring Team,",
      defaultClosing: "Sincerely,",
    });
    if (normalized.bodyParagraphs.length === 0) {
      const roleText = role || "the role";
      normalized.bodyParagraphs = [
        `I am writing to express my interest in ${roleText}${company ? ` at ${company}` : ""}.`,
        "My background aligns with the role requirements, and I can contribute quickly in a team-focused environment.",
        "Thank you for your consideration. I would welcome the opportunity to discuss my qualifications further.",
      ];
    }
    return normalizeDocumentText(normalizedCoverLetterToText(normalized));
  }

  function formatResumeDocument(r: Result | null) {
    if (!r) return "";
    const candidateName = getCandidateName(r);
    const company = getJobCompany(r);
    const role = getJobTitle(r);
    const dateLabel = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date());
    const context = { candidateName, company, role, dateLabel };
    const fullResumeText = stripPlaceholders(getRawDocumentText(r, "updatedResume"), context);
    const summary = stripPlaceholders(
      pickFirstNonEmpty(r.resumeUpdates?.summaryRewrite, r.job?.summary),
      context
    );
    const skills = dedupeTextItems([
      ...(r.resumeUpdates?.skillsToAdd ?? []),
      ...(r.resumeUpdates?.atsKeywords ?? []),
    ]);
    const bulletEdits = (r.resumeUpdates?.bulletEdits ?? [])
      .map((edit) => ({
        section: normalizeDocumentText(stripPlaceholders(edit.section, context)),
        bullet: normalizeDocumentText(
          stripPlaceholders(pickFirstNonEmpty(edit.after, edit.before), context)
        ),
      }))
      .filter((edit) => edit.section && edit.bullet);

    const groupedExperience = new Map<string, string[]>();
    for (const edit of bulletEdits) {
      const current = groupedExperience.get(edit.section) ?? [];
      current.push(edit.bullet);
      groupedExperience.set(edit.section, current);
    }

    const fallbackLines: string[] = [];
    if (candidateName) fallbackLines.push(candidateName);
    if (r.candidateEmail?.trim()) fallbackLines.push(r.candidateEmail.trim());
    if (fallbackLines.length > 0) fallbackLines.push("");

    if (summary) {
      fallbackLines.push("PROFESSIONAL SUMMARY", summary, "");
    }

    if (skills.length > 0) {
      fallbackLines.push("SKILLS", ...skills.map((skill) => `- ${skill}`), "");
    }

    if (groupedExperience.size > 0) {
      fallbackLines.push("PROFESSIONAL EXPERIENCE", "");
      for (const [section, sectionBullets] of groupedExperience.entries()) {
        fallbackLines.push(section);
        fallbackLines.push(...sectionBullets.map((bullet) => `- ${bullet}`));
        fallbackLines.push("");
      }
    }

    const sourceResumeText = fullResumeText || normalizeDocumentText(fallbackLines.join("\n"));
    const normalizedResume = normalizeResume({
      rawText: sourceResumeText,
      candidateName: candidateName || null,
      candidateContactLines: dedupeTextItems([r.candidateEmail ?? ""]),
    });
    return normalizeDocumentText(normalizedResumeToText(normalizedResume));
  }

  function extractQuestionLines(value: string) {
    const sentences = (value.match(/[^?.!]*\?/g) ?? [])
      .map((question) => normalizeDocumentText(question))
      .filter((question) => question.length > 10)
      .map((question) => (question.endsWith("?") ? question : `${question}?`));
    return dedupeTextItems(sentences).slice(0, 2);
  }

  function formatPreInterviewEmail(r: Result | null) {
    if (!r) return "";
    const candidateName = getCandidateName(r);
    const company = getJobCompany(r);
    const role = getJobTitle(r);
    const dateLabel = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date());
    const context = { candidateName, company, role, dateLabel };
    const raw = stripPlaceholders(getRawDocumentText(r, "preInterview"), context);
    const paragraphs = splitParagraphs(raw).filter(
      (paragraph) =>
        !/^subject:/i.test(paragraph) &&
        !/^hello\s+/i.test(paragraph) &&
        !/^dear\s+/i.test(paragraph) &&
        !/^(best|best regards|kind regards|regards|sincerely)[,\s]*$/i.test(paragraph) &&
        paragraph.toLowerCase() !== candidateName.toLowerCase()
    );

    const subjectSuffix = role
      ? ` - ${role}${company ? ` at ${company}` : ""}`
      : company
        ? ` - Opportunity at ${company}`
        : "";
    const subject = `Subject: Confirming Interview Interest${subjectSuffix}`;
    const intro =
      paragraphs[0] ||
      `Thank you for considering my application${role ? ` for the ${role} role` : ""}${company ? ` at ${company}` : ""}. I remain very interested in the opportunity.`;
    const alignment =
      paragraphs[1] ||
      "My background aligns with your priorities, and I would welcome the chance to discuss how I can contribute.";
    const questions =
      extractQuestionLines(raw).length > 0
        ? extractQuestionLines(raw)
        : [
            "Could you share the top priorities for this role in the first 90 days?",
            "How does the team define success for this position?",
          ];

    const lines = [
      subject,
      "",
      "Hello Hiring Team,",
      "",
      intro,
      "",
      alignment,
      "",
      "I had two quick questions as I prepare:",
      ...questions.map((question) => `- ${question}`),
      "",
      "Best,",
    ];
    if (candidateName) {
      lines.push(candidateName);
    }

    return normalizeDocumentText(lines.join("\n"));
  }

  function formatPostInterviewEmail(r: Result | null) {
    if (!r) return "";
    const candidateName = getCandidateName(r);
    const company = getJobCompany(r);
    const role = getJobTitle(r);
    const dateLabel = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date());
    const context = { candidateName, company, role, dateLabel };
    const raw = stripPlaceholders(getRawDocumentText(r, "postInterview"), context);
    const paragraphs = splitParagraphs(raw).filter(
      (paragraph) =>
        !/^subject:/i.test(paragraph) &&
        !/^hello\s+/i.test(paragraph) &&
        !/^dear\s+/i.test(paragraph) &&
        !/^(best|best regards|kind regards|regards|sincerely)[,\s]*$/i.test(paragraph) &&
        paragraph.toLowerCase() !== candidateName.toLowerCase()
    );

    const roleText = role ? `${role} ` : "";
    const subject = `Subject: Thank You - ${roleText}Interview`.replace(/\s+/g, " ").trim();
    const thanksLine =
      paragraphs[0] ||
      `Thank you for taking the time to speak with me${role ? ` about the ${role} role` : ""}${company ? ` at ${company}` : ""}.`;
    const conversationLine =
      paragraphs[1] ||
      "I appreciated the conversation and the insight you shared about the team and role expectations.";
    const reaffirmLine =
      paragraphs[2] ||
      "After our discussion, I am even more excited about the opportunity to contribute.";

    const lines: string[] = [
      subject,
      "",
      "Hello Hiring Team,",
      "",
      thanksLine,
      "",
      conversationLine,
      "",
      reaffirmLine,
      "",
      "Best,",
    ];
    if (candidateName) lines.push(candidateName);

    return normalizeDocumentText(lines.join("\n"));
  }

  function getFormattedDocumentText(r: Result | null, tab: TabKey) {
    if (!r) return "";
    if (tab === "coverLetter") return formatCoverLetterDocument(r);
    if (tab === "updatedResume") return formatResumeDocument(r);
    if (tab === "preInterview") return formatPreInterviewEmail(r);
    return formatPostInterviewEmail(r);
  }

  function getActiveEditableText(tab: TabKey) {
    const editedValue = editableDocs[tab];
    if (editedValue !== null) return editedValue;
    return getFormattedDocumentText(result, tab);
  }

  function getMeaningfulDocText(tab: TabKey) {
    return normalizeDocumentText(getActiveEditableText(tab));
  }

  async function writeTextToClipboard(text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to legacy copy path.
      }
    }

    if (typeof document === "undefined") return false;

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    } finally {
      textarea.remove();
    }

    return copied;
  }

  async function copyActive() {
    const text = getMeaningfulDocText(activeTab);
    if (!text) {
      setCopyStatus("error");
      return;
    }

    const copied = await writeTextToClipboard(text);
    setCopyStatus(copied ? "success" : "error");

    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
      copyResetTimeoutRef.current = null;
    }
    copyResetTimeoutRef.current = window.setTimeout(() => {
      setCopyStatus("idle");
      copyResetTimeoutRef.current = null;
    }, 2200);
  }

  function downloadBlob(filename: string, blob: Blob) {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1200);
  }

  function getDocumentFileMeta(tab: TabKey): { baseFilename: string; title: string } {
    if (tab === "coverLetter") return { baseFilename: "cover-letter", title: "Cover Letter" };
    if (tab === "updatedResume") return { baseFilename: "revised-resume", title: "Revised Resume" };
    if (tab === "preInterview") return { baseFilename: "pre-interview-email", title: "Pre-Interview Email" };
    return { baseFilename: "post-interview-email", title: "Post-Interview Email" };
  }

  function normalizePdfText(value: string) {
    return value
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2026/g, "...")
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
  }

  function wrapPdfTextToLines(
    text: string,
    maxWidth: number,
    measure: (value: string) => number
  ) {
    const normalized = normalizePdfText(text);
    const finalLines: string[] = [];

    for (const rawLine of normalized.split("\n")) {
      const line = rawLine.trimEnd();
      if (!line) {
        finalLines.push("");
        continue;
      }

      let current = "";
      const words = line.split(/\s+/).filter(Boolean);
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (measure(next) <= maxWidth) {
          current = next;
          continue;
        }

        if (current) finalLines.push(current);

        if (measure(word) <= maxWidth) {
          current = word;
          continue;
        }

        let sliceStart = 0;
        while (sliceStart < word.length) {
          let sliceEnd = sliceStart + 1;
          while (
            sliceEnd <= word.length &&
            measure(word.slice(sliceStart, sliceEnd)) <= maxWidth
          ) {
            sliceEnd += 1;
          }

          const chunk = word.slice(sliceStart, Math.max(sliceStart + 1, sliceEnd - 1));
          if (sliceEnd - 1 < word.length) {
            finalLines.push(chunk);
          } else {
            current = chunk;
          }
          sliceStart = Math.max(sliceStart + 1, sliceEnd - 1);
        }
      }

      if (current) finalLines.push(current);
    }

    return finalLines;
  }

  async function createPdfBlob(
    text: string,
    title: string,
    options?: {
      showTitle?: boolean;
      bodySize?: number;
      lineHeight?: number;
    }
  ): Promise<Blob> {
    const normalizedText = normalizeDocumentText(text);
    if (!normalizedText) {
      throw new Error("There is no generated content to download yet.");
    }

    const showTitle = options?.showTitle ?? true;
    const bodySize = options?.bodySize ?? 11;
    const lineHeight = options?.lineHeight ?? 16;
    const pdfDoc = await PDFDocument.create();
    const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageSize: [number, number] = [612, 792];
    const margin = 50;
    const titleSize = 15;
    const titleGap = 28;
    const maxWidth = pageSize[0] - margin * 2;
    const safeTitle = normalizePdfText(title);
    const lines = wrapPdfTextToLines(normalizedText, maxWidth, (value) =>
      bodyFont.widthOfTextAtSize(value, bodySize)
    );

    let page = pdfDoc.addPage(pageSize);
    let cursorY = pageSize[1] - margin;

    const drawPageHeader = () => {
      if (!showTitle) return;
      page.drawText(safeTitle, {
        x: margin,
        y: cursorY,
        size: titleSize,
        font: titleFont,
        color: rgb(0.1, 0.15, 0.25),
      });
      cursorY -= titleGap;
    };

    drawPageHeader();

    for (const line of lines) {
      if (cursorY < margin) {
        page = pdfDoc.addPage(pageSize);
        cursorY = pageSize[1] - margin;
        drawPageHeader();
      }

      if (line) {
        page.drawText(line, {
          x: margin,
          y: cursorY,
          size: bodySize,
          font: bodyFont,
          color: rgb(0.18, 0.18, 0.2),
        });
      }

      cursorY -= lineHeight;
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = pdfBytes.buffer.slice(
      pdfBytes.byteOffset,
      pdfBytes.byteOffset + pdfBytes.byteLength
    ) as ArrayBuffer;
    return new Blob([pdfBuffer], { type: "application/pdf" });
  }

  async function createCoverLetterPdfBlob(text: string): Promise<Blob> {
    const cleanCoverLetter = normalizeDocumentText(text);
    return createPdfBlob(cleanCoverLetter, "Cover Letter", {
      showTitle: false,
      lineHeight: 18,
    });
  }

  async function createResumePdfBlob(text: string): Promise<Blob> {
    const cleanResume = normalizeDocumentText(text);
    return createPdfBlob(cleanResume, "Revised Resume", {
      showTitle: false,
      lineHeight: 17,
    });
  }

  function escapeXml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function normalizeDocxText(value: string) {
    return value
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  }

  function createDocxBlob(text: string, title: string): Blob {
    const normalizedText = normalizeDocumentText(text);
    if (!normalizedText) {
      throw new Error("There is no generated content to download yet.");
    }

    const safeText = normalizeDocxText(normalizedText);
    const safeTitle = normalizeDocxText(title);
    const paragraphs = [`<w:p><w:r><w:t>${escapeXml(safeTitle)}</w:t></w:r></w:p>`]
      .concat(
        safeText.split("\n").map((line) => {
          if (!line.trim()) return "<w:p/>";
          return `<w:p><w:r><w:t xml:space=\"preserve\">${escapeXml(line)}</w:t></w:r></w:p>`;
        })
      )
      .join("");

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    const docxZip = buildZip([
      {
        filename: "[Content_Types].xml",
        bytes: textEncoder.encode(contentTypesXml),
      },
      {
        filename: "_rels/.rels",
        bytes: textEncoder.encode(relsXml),
      },
      {
        filename: "word/document.xml",
        bytes: textEncoder.encode(documentXml),
      },
    ]);

    return new Blob([docxZip], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  function crc32(bytes: Uint8Array) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j++) {
        const mask = -(crc & 1);
        crc = (crc >>> 1) ^ (0xedb88320 & mask);
      }
    }
    return (crc ^ -1) >>> 0;
  }

  function buildZip(files: Array<{ filename: string; bytes: Uint8Array }>): Blob {
    const localEntries: Uint8Array[] = [];
    const centralEntries: Uint8Array[] = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = textEncoder.encode(file.filename);
      const crc = crc32(file.bytes);

      const localHeader = new Uint8Array(30 + nameBytes.length + file.bytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, 0, true);
      localView.setUint16(12, 0, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, file.bytes.length, true);
      localView.setUint32(22, file.bytes.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);
      localHeader.set(file.bytes, 30 + nameBytes.length);
      localEntries.push(localHeader);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, 0, true);
      centralView.setUint16(14, 0, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, file.bytes.length, true);
      centralView.setUint32(24, file.bytes.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);
      centralEntries.push(centralHeader);

      offset += localHeader.length;
    }

    const centralSize = centralEntries.reduce((sum, entry) => sum + entry.length, 0);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);

    return new Blob([...localEntries, ...centralEntries, endRecord] as BlobPart[], {
      type: "application/zip",
    });
  }

  async function downloadActiveAs(format: DownloadFormat) {
    const text = getMeaningfulDocText(activeTab);
    if (!text) {
      setError("There is no generated content to download yet.");
      return;
    }

    try {
      const { baseFilename, title } = getDocumentFileMeta(activeTab);
      if (format === "pdf") {
        const pdfBlob =
          activeTab === "coverLetter"
            ? await createCoverLetterPdfBlob(text)
            : activeTab === "updatedResume"
              ? await createResumePdfBlob(text)
            : await createPdfBlob(text, title);
        downloadBlob(`${baseFilename}.pdf`, pdfBlob);
      } else if (format === "txt") {
        const txtBlob = new Blob([text], { type: "text/plain;charset=utf-8" });
        downloadBlob(`${baseFilename}.txt`, txtBlob);
      } else {
        const docxBlob = createDocxBlob(text, title);
        downloadBlob(`${baseFilename}.docx`, docxBlob);
      }
      setDownloadMenuOpen(false);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to generate the document right now."
      );
    }
  }

  async function downloadAll() {
    if (!result) {
      setError("Generate documents first before downloading them.");
      return;
    }

    const resolvedFiles = await Promise.all(
      allDocTabs.map(async (tab) => {
        const text = getMeaningfulDocText(tab);
        if (!text) return null;

        const meta = getDocumentFileMeta(tab);
        const pdfBlob =
          tab === "coverLetter"
            ? await createCoverLetterPdfBlob(text)
            : tab === "updatedResume"
              ? await createResumePdfBlob(text)
            : await createPdfBlob(text, meta.title);
        return {
          filename: `${meta.baseFilename}.pdf`,
          bytes: new Uint8Array(await pdfBlob.arrayBuffer()),
        };
      })
    );
    const files: Array<{ filename: string; bytes: Uint8Array }> = [];
    for (const file of resolvedFiles) {
      if (file) files.push(file);
    }

    if (files.length === 0) {
      setError("There is no generated content to download yet.");
      return;
    }

    try {
      const zipBlob = buildZip(files);
      downloadBlob("application-documents.zip", zipBlob);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to generate the PDF files right now."
      );
    }
  }

  async function onGenerate() {
    setError(null);
    setResult(null);
    setEditableDocs(createEmptyEditableDocs());

    setLoading(true);
    try {
      const nextUrl = `/job-tools/generate${url.trim() ? `?jobUrl=${encodeURIComponent(url.trim())}` : ""}`;
      const readPlanStatus = async (forceSync = false) => {
        const planRes = await fetch(
          forceSync ? "/api/billing/plan-status?forceSync=1" : "/api/billing/plan-status",
          { cache: "no-store" }
        );

        if (planRes.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent(nextUrl)}`;
          return null;
        }
        if (!planRes.ok) {
          throw new Error("Unable to verify subscription status.");
        }

        const nextPlanStatus = (await planRes.json()) as PlanStatusResponse;
        setPlanStatus(nextPlanStatus);
        return nextPlanStatus;
      };

      const readCreditStatus = async () => {
        const creditRes = await fetch("/api/user/hirepilot-status", {
          cache: "no-store",
        });

        if (creditRes.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent(nextUrl)}`;
          return null;
        }

        if (!creditRes.ok) {
          throw new Error("Unable to verify credit balance.");
        }

        const nextCreditStatus = (await creditRes.json()) as CreditStatusResponse;
        setCreditStatus(nextCreditStatus);
        return nextCreditStatus;
      };

      let planData = await readPlanStatus(false);
      if (!planData) return;

      if (planData?.pending === true || planData?.active !== true) {
        const refreshedPlanData = await readPlanStatus(true);
        if (!refreshedPlanData) return;

        console.log("[GENERATE_GATE] forced access recheck", {
          userId: refreshedPlanData?.userId ?? null,
          trialSubscriber: refreshedPlanData?.trialSubscriber ?? false,
          monthlySubscriber: refreshedPlanData?.monthlySubscriber ?? false,
          yearlySubscriber: refreshedPlanData?.yearlySubscriber ?? false,
          trialPlanStatus: refreshedPlanData?.trialPlanStatus ?? null,
          monthlyPlanStatus: refreshedPlanData?.monthlyPlanStatus ?? null,
          yearlyPlanStatus: refreshedPlanData?.yearlyPlanStatus ?? null,
          planType: refreshedPlanData?.planType ?? null,
          planStatus: refreshedPlanData?.planStatus ?? null,
          accessState: refreshedPlanData?.accessState ?? "inactive",
          pendingAccess: refreshedPlanData?.pending === true,
          hasPaidAccess: refreshedPlanData?.active === true,
        });

        planData = refreshedPlanData;
      }

      const hasPaidAccess = planData?.active === true;
      const pendingAccess = planData?.pending === true;
      let currentCreditStatus = creditStatus;

      console.log("[GENERATE_GATE] initial access check", {
        userId: planData?.userId ?? null,
        trialSubscriber: planData?.trialSubscriber ?? false,
        monthlySubscriber: planData?.monthlySubscriber ?? false,
        yearlySubscriber: planData?.yearlySubscriber ?? false,
        trialPlanStatus: planData?.trialPlanStatus ?? null,
        monthlyPlanStatus: planData?.monthlyPlanStatus ?? null,
        yearlyPlanStatus: planData?.yearlyPlanStatus ?? null,
        planType: planData?.planType ?? null,
        planStatus: planData?.planStatus ?? null,
        accessState: planData?.accessState ?? "inactive",
        pendingAccess,
        hasPaidAccess,
      });

      if (!hasPaidAccess) {
        currentCreditStatus = await readCreditStatus();
        if (!currentCreditStatus) return;
      }

      const remainingCredits = Number(currentCreditStatus?.hirePilotCredits ?? 0);

      if (pendingAccess && !hasPaidAccess && remainingCredits <= 0) {
        console.warn("[GENERATE_GATE] payment sync still pending after forced recheck", {
          userId: planData?.userId ?? null,
          accessState: planData?.accessState ?? "pending",
          planStatus: planData?.planStatus ?? null,
        });
        setError("We’re confirming your subscription. Please wait a moment and try Generate again.");
        setError(
          "We're still syncing your subscription. Refresh once or revisit your billing confirmation page, then try Generate again."
        );
        return;
      }

      if (!hasPaidAccess && remainingCredits <= 0) {
        setError(
          "You've used all 5 free credits. Upgrade to continue using HirePilot and AI Assistant Apply."
        );
        return;
      }

      if (!canSubmit && !hasFallbackText) {
        setError("Please paste a valid http(s) job posting link or provide at least 150 characters in the fallback text field.");
        return;
      }

      const selectedFocus = Object.entries(focus)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const formData = new FormData();
      formData.set("url", url.trim());
      formData.set("resumeText", "");
      formData.set(
        "tone",
        tone === "professional" ? "professional" : tone === "conversational" ? "friendly" : "bold"
      );
      formData.set("llmProvider", llmProvider);
      formData.set("focusAreas", JSON.stringify(selectedFocus));
      formData.set("instructions", instructions.trim());
      formData.set("pastedJobText", pastedJobText.trim());
      formData.set(
        "usageKey",
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `ai-assistant-apply-${Date.now()}`
      );
      if (resumeFile) {
        formData.set("resumeFile", resumeFile);
      }

      const res = await fetch("/api/job-tools/generate", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        if (data?.credits) {
          setCreditStatus((current) => ({
            ...(current ?? {}),
            hirePilotCredits: Number(data.credits.remaining ?? current?.hirePilotCredits ?? 0),
            starterCredits: Number(
              data.credits.starterRemaining ?? current?.starterCredits ?? 0
            ),
            starterCreditsGranted: Boolean(
              data.credits.starterGranted ?? current?.starterCreditsGranted
            ),
          }));
        }
        throw new Error(data?.error ?? "Failed to generate");
      }

      setActiveTab("coverLetter");
      shouldFocusGeneratedCoverLetterRef.current = true;
      setResult(data);
      setEditableDocs({
        coverLetter: getFormattedDocumentText(data, "coverLetter"),
        updatedResume: getFormattedDocumentText(data, "updatedResume"),
        preInterview: getFormattedDocumentText(data, "preInterview"),
        postInterview: getFormattedDocumentText(data, "postInterview"),
      });
      if (data?.credits) {
        setCreditStatus((current) => ({
          ...(current ?? {}),
          hirePilotCredits: Number(data.credits.remaining ?? current?.hirePilotCredits ?? 0),
          starterCredits: Number(
            data.credits.starterRemaining ?? current?.starterCredits ?? 0
          ),
          starterCreditsGranted: Boolean(
            data.credits.starterGranted ?? current?.starterCreditsGranted
          ),
        }));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const activeText = getActiveEditableText(activeTab);
  const hasDownloadableActiveText = Boolean(getMeaningfulDocText(activeTab));
  const hasAnyDownloadableDocs = Boolean(
    result &&
      allDocTabs.some((tab) => Boolean(getMeaningfulDocText(tab)))
  );
  const activeTitle =
    activeTab === "coverLetter"
      ? "AI-Generated Cover Letter"
      : activeTab === "updatedResume"
      ? "AI-Generated Revised Resume"
      : activeTab === "preInterview"
      ? "AI-Generated Pre-Interview Email"
      : "AI-Generated Post-Interview Email";
  const shouldShowStarterCredits =
    !accessStatusLoading &&
    planStatus?.active !== true &&
    Boolean(creditStatus?.starterCreditsGranted);

  return (
    <div className="min-h-screen ">
      {/* Top bar (simple, no nav) */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-sky-500 text-white">
              <SparklesIcon className="h-5 w-5" />
            </div>
            <div className="text-sm font-semibold text-slate-900">Hirexa AI</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-slate-200" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white">
            Generate Your Perfect Application
          </h1>
          <p className="mt-2 text-sm text-white">
            Paste a job URL, and Hirexa will draft tailored cover letters, resume updates, and follow-up emails for you to review and personalize.
          </p>
        </div>

        {/* URL + Generate */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-sky-500">
                <LinkIcon className="h-5 w-5" />
              </div>
              <div className="w-full">
                <div className="text-xs font-semibold text-slate-700">Job Posting URL</div>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://company.com/careers/job/123"
                  className="mt-1 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-56 sm:shrink-0">
              <label className="text-xs font-semibold text-slate-700" htmlFor="llm-provider-select">
                AI Model
              </label>
              <select
                id="llm-provider-select"
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value as LlmProvider)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-slate-400"
              >
                {llmProviderOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={onGenerate}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-sm "
              >
                {loading ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <SparklesIcon className="h-5 w-5" />}
                {loading ? "Generating" : "Generate"}
              </button>
            </div>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            Tip: Some sites block bots. If extraction fails, paste the job description in the fallback field below.
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {shouldShowStarterCredits ? (
            <div
              className={[
                "mt-4 rounded-xl px-4 py-3 text-sm",
                Number(creditStatus?.starterCredits ?? 0) > 0
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border border-amber-200 bg-amber-50 text-amber-800",
              ].join(" ")}
            >
              {Number(creditStatus?.starterCredits ?? 0) > 0
                ? `Free Credits Remaining: ${Number(creditStatus?.starterCredits ?? 0)}`
                : "You've used all 5 free credits. Upgrade to continue using HirePilot and AI Assistant Apply."}
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Job Description Fallback (optional)</div>
          <div className="mt-1 text-xs text-slate-500">
            Paste the full job description if the URL blocks scraping. This text will be used directly.
          </div>
          <textarea
            value={pastedJobText}
            onChange={(e) => setPastedJobText(e.target.value)}
            placeholder="Paste the job description here..."
            className="mt-3 h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
          />
        </div>

        {/* Upload resume */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-700">
              <CloudArrowUpIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Upload Your Current Resume</div>
              <div className="text-xs text-slate-500">PDF, DOCX, or TXT supported</div>
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" ? fileInputRef.current?.click() : null)}
            className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center"
          >
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-700 shadow-sm">
              <CloudArrowUpIcon className="h-6 w-6" />
            </div>
            <div className="mt-3 text-sm font-semibold text-slate-900">
              {resumeFile ? resumeFile.name : "Drag & drop your resume here"}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {resumeFile ? "Upload included in next generate request" : "or click to browse files"}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setResumeFile(f);
              }}
            />
          </div>

          {(result?.savedResume || result?.profileSync?.updatedFields?.length) && (
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {result?.savedResume
                ? `Saved ${result.savedResume.fileName || "your uploaded resume"} to your profile.`
                : "Synced your uploaded resume to your profile."}
              {result?.profileSync?.updatedFields?.length
                ? ` Filled missing profile fields: ${result.profileSync.updatedFields.join(", ")}.`
                : ""}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {tabs.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold",
                  active
                    ? "border-sky-200 bg-sky-50 text-sky-600"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-sky-600",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Document card + actions */}
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div
              ref={activeDocumentTitleRef}
              tabIndex={-1}
              className="text-sm font-semibold text-slate-900 outline-none"
            >
              {activeTitle}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyActive}
                disabled={!hasDownloadableActiveText}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <ClipboardIcon className="h-4 w-4" />
                {copyStatus === "success"
                  ? "Copied"
                  : copyStatus === "error"
                  ? "Copy failed"
                  : "Copy"}
              </button>

              <div className="relative" ref={downloadMenuRef}>
                <button
                  type="button"
                  onClick={() => setDownloadMenuOpen((current) => !current)}
                  disabled={!hasDownloadableActiveText}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  Download
                  <ChevronDownIcon className="h-4 w-4" />
                </button>

                {downloadMenuOpen ? (
                  <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    <button
                      type="button"
                      onClick={() => void downloadActiveAs("pdf")}
                      className="block w-full px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Download as PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadActiveAs("txt")}
                      className="block w-full px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Download as TXT
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadActiveAs("docx")}
                      className="block w-full px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Download as DOCX
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={onGenerate}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <ArrowPathIcon className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
                Regenerate
              </button>
            </div>
          </div>

          <div className="px-5 py-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <textarea
                value={activeText}
                onChange={(e) =>
                  setEditableDocs((prev) => ({
                    ...prev,
                    [activeTab]: e.target.value,
                  }))
                }
                disabled={!result}
                placeholder="Your generated document will appear here after processing the job URL."
                className="h-56 w-full resize-none whitespace-pre-wrap bg-transparent text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
              />
            </div>

            {/* Controls grid */}
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {/* Tone & Style */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Tone & Style</div>
                <div className="mt-3 space-y-2">
                  <ToneRow
                    label="Professional"
                    checked={tone === "professional"}
                    onClick={() => setTone("professional")}
                  />
                  <ToneRow
                    label="Conversational"
                    checked={tone === "conversational"}
                    onClick={() => setTone("conversational")}
                  />
                  <ToneRow
                    label="Enthusiastic"
                    checked={tone === "enthusiastic"}
                    onClick={() => setTone("enthusiastic")}
                  />
                </div>
              </div>

              {/* Focus Areas */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Focus Areas</div>
                <div className="mt-3 space-y-2">
                  {focusOptions.map((o) => (
                    <CheckRow
                      key={o.key}
                      label={o.label}
                      checked={!!focus[o.key]}
                      onClick={() => toggleFocus(o.key)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Additional instructions */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-700">
                  <SparklesIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Additional Instructions (optional)
                  </div>
                  <div className="text-xs text-slate-500">
                    Add specific details you&apos;d like to highlight or omit about your application.
                  </div>
                </div>
              </div>

              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Example: Emphasize customer service leadership and quantify results. Keep it to one page."
                className="mt-3 h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
              <div className="mt-2 text-xs text-slate-500">
                This information is used to personalize your application assets.
              </div>
            </div>

            {/* Bottom bar */}
            <div className="mt-5 flex flex-col gap-4 border-t border-slate-200 pt-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-2 text-xs text-slate-500">
                <ShieldCheckIcon className="h-4 w-4 text-sky-600" />
                <div className="space-y-1">
                  <p>Your data is processed securely and never shared.</p>
                  <p className="text-slate-400">
                    Hirexa creates AI-assisted drafts to help you move faster. Review and personalize each document before you use it.
                  </p>
                </div>
              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                <button
                  type="button"
                  onClick={resetAll}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto"
                >
                  Reset
                </button>

                <button
                  type="button"
                  onClick={downloadAll}
                  disabled={!hasAnyDownloadableDocs}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 sm:w-auto"
                >
                  <ArrowDownTrayIcon className="h-5 w-5" />
                  Download All Documents
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-200 py-6 text-xs text-slate-500 sm:flex-row">
          <div>© {new Date().getFullYear()} Hirexa AI. All rights reserved.</div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/privacy" className="hover:text-slate-700">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-slate-700">
              Terms of Service
            </Link>
            <Link href="/contact-us" className="hover:text-slate-700">
              Contact
            </Link>
          </div>
        </div>
      </div>

      <AppliedJobsPopout buttonId="applied-jobs-popout-toggle" />
    </div>
  );
}

export default function JobToolsGeneratePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <JobToolsGeneratePageContent />
    </Suspense>
  );
}

function ToneRow({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm",
        checked
          ? "border-violet-200 bg-violet-50 text-sky-600"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span
          className={[
            "inline-flex h-4 w-4 items-center justify-center rounded-full border",
            checked ? "border-sky-600 bg-sky-500" : "border-slate-300 bg-white",
          ].join(" ")}
        >
          <span className={["h-1.5 w-1.5 rounded-full", checked ? "bg-white" : "bg-transparent"].join(" ")} />
        </span>
        <span className="font-semibold">{label}</span>
      </div>
    </button>
  );
}

function CheckRow({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm",
        checked
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span
          className={[
            "inline-flex h-4 w-4 items-center justify-center rounded border",
            checked ? "border-emerald-600 bg-emerald-600" : "border-slate-300 bg-white",
          ].join(" ")}
        >
          <span className={["h-2 w-2", checked ? "bg-white" : "bg-transparent"].join(" ")} />
        </span>
        <span className="font-semibold">{label}</span>
      </div>
    </button>
  );
}
