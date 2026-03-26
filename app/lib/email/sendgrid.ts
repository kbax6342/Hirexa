import sgMail from "@sendgrid/mail";

import { getEmailConfig, getSecurityEmailConfig, sendEmail } from "./mailer";

type LifecycleJobSummary = {
  title: string;
  company: string;
  location?: string | null;
  jobUrl?: string | null;
};

type EmailCategory = "transactional" | "marketing";
type SenderProfile = "default" | "security";
export type PasswordResetSendMode = "template" | "plain-test";

const TEMPLATE_IDS = {
  welcome: "d-3f0e511e3e634a8586e1342c5dba663c",
  verificationCode: "d-9fa43cf22c54494687c32cc4f02640f7",
  passwordReset: "d-06369f660377424e89dd66ed6e277f5f",
  profileCompleted: "d-6edb6e089f0e4fbf8d8a620bd94ed48f",
  resumeUploadSuccess: "d-5aaf27029e2445a294d28fe051ae26b5",
  accountDeletedConfirmation: "d-0aa5c7e5b3234eddac4315fb57e1a8b2",
  creditsRunningLow: "d-704b8547d9dd4114bc6a2d3bf25a82ed",
  completeProfileReminder: "d-d623933880d6413e95ec7708d42f3b80",
  uploadResumeReminder: "d-0889b398d7e74793b21040b16bd6839e",
  firstSmartMatchesReady: "d-454f7fe45fc24191a276885ac4b174bb",
  inactiveUserComeback: "d-c9f3ec663e334501bbf167e151e8ff0b",
} as const;

type TemplateKey = keyof typeof TEMPLATE_IDS;

type TemplateDataValue = string | number | boolean | null | undefined;

type TemplateData = {
  email_subject: string;
  email_preheader?: string;
  headline?: string;
  body_text?: string;
  cta_label?: string;
  cta_url?: string;
  first_name?: string;
  verification_code?: string;
  reset_url?: string;
  credits_remaining?: number;
  jobs_count?: number;
  support_email?: string;
} & Record<string, TemplateDataValue>;

const WELCOME_EMAIL_CATEGORY =
  process.env.WELCOME_EMAIL_CATEGORY === "transactional"
    ? "transactional"
    : "marketing";

let sendGridConfigured = false;

function getSendGridClient() {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing SENDGRID_API_KEY");
  }

  if (!sendGridConfigured) {
    sgMail.setApiKey(apiKey);
    sendGridConfigured = true;
  }

  return sgMail;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeName(name?: string | null) {
  return (name ?? "").trim();
}

function getTemplateFirstName(name?: string | null) {
  const safeName = normalizeName(name);
  return safeName ? safeName.split(/\s+/)[0] ?? safeName : undefined;
}

function formatGreeting(name?: string | null) {
  const safeName = normalizeName(name);
  return safeName ? `Hi ${safeName},` : "Hi there,";
}

function formatDate(value?: Date | string | null) {
  if (!value) return "your current billing period";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "your current billing period";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value?: Date | string | null) {
  if (!value) return "soon";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderParagraphs(paragraphs: string[]) {
  return paragraphs
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function renderBulletList(items: string[]) {
  if (items.length === 0) return "";
  return `<ul style="margin:12px 0 0 18px;padding:0">${items
    .map((item) => `<li style="margin:0 0 8px">${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

function renderJobs(jobs: LifecycleJobSummary[]) {
  if (jobs.length === 0) return "";

  return jobs
    .map((job) => {
      const label = [job.company, job.location].filter(Boolean).join(" - ");
      const meta = label
        ? `<div style="color:#6b7280;font-size:13px">${escapeHtml(label)}</div>`
        : "";
      const cta = job.jobUrl
        ? `<div style="margin-top:6px"><a href="${escapeHtml(job.jobUrl)}" style="color:#145efc">View role</a></div>`
        : "";

      return `
        <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin:0 0 12px">
          <div style="font-weight:700;color:#111827">${escapeHtml(job.title)}</div>
          ${meta}
          ${cta}
        </div>
      `;
    })
    .join("");
}

function buildTextBody(lines: Array<string | null | undefined>) {
  return lines.filter(Boolean).join("\n");
}

function buildHirexaEmail(params: {
  greeting?: string;
  title?: string;
  paragraphs: string[];
  bullets?: string[];
  jobs?: LifecycleJobSummary[];
  customSections?: string[];
  primaryAction?: { href: string; label: string } | null;
  footerLines?: Array<string | null | undefined>;
}) {
  const greeting = params.greeting ? `<p>${escapeHtml(params.greeting)}</p>` : "";
  const title = params.title
    ? `<h2 style="margin:0 0 12px;color:#111827">${escapeHtml(params.title)}</h2>`
    : "";
  const primaryAction = params.primaryAction
    ? `<p><a href="${escapeHtml(params.primaryAction.href)}" style="color:#145efc">${escapeHtml(
        params.primaryAction.label
      )}</a></p>`
    : "";
  const footerText = (params.footerLines ?? []).filter(Boolean).join("<br />");
  const footer = footerText
    ? `<p style="margin-top:24px;color:#6b7280;font-size:12px">${footerText}</p>`
    : "";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111">
      ${greeting}
      ${title}
      ${renderParagraphs(params.paragraphs)}
      ${renderBulletList(params.bullets ?? [])}
      ${(params.customSections ?? []).join("")}
      ${params.jobs?.length ? `<div style="margin-top:16px">${renderJobs(params.jobs)}</div>` : ""}
      ${primaryAction}
      ${footer}
    </div>
  `;
}

function resolveAppUrl(path = "") {
  const base =
    process.env.NEXT_PUBLIC_APP_URL_LIVE?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000";

  const normalizedBase = base.replace(/\/+$/, "");
  if (!path) {
    return normalizedBase;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function cleanTemplateData(data: TemplateData) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  ) as TemplateData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toSerializable(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return "[MaxDepthExceeded]";
  }

  if (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item, depth + 1));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (typeof Headers !== "undefined" && value instanceof Headers) {
    return Object.fromEntries(value.entries());
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        toSerializable(nestedValue, depth + 1),
      ])
    );
  }

  return String(value);
}

function summarizeSendGridError(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: "Unknown SendGrid error" };
  }

  const candidate = error as Error & {
    code?: string | number;
    response?: {
      statusCode?: number;
      body?: unknown;
      headers?: unknown;
    };
  };

  const responseBody = toSerializable(candidate.response?.body);
  const responseHeaders = toSerializable(candidate.response?.headers);
  const providerErrors =
    isRecord(candidate.response?.body) && Array.isArray(candidate.response.body.errors)
      ? toSerializable(candidate.response.body.errors)
      : undefined;

  const details: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    code: candidate.code ?? null,
    statusCode: candidate.response?.statusCode ?? null,
    responseBody,
    responseHeaders,
    providerErrors: providerErrors ?? null,
  };

  return details;
}

function logSendGridFailure(params: {
  mode: "template" | "plain-test";
  template?: TemplateKey | null;
  subject: string;
  to: string;
  from: string;
  replyTo?: string;
  plainTestMode: boolean;
  error: unknown;
}) {
  const diagnostic = {
    mode: params.mode,
    template: params.template ?? null,
    subject: params.subject,
    toDomain: params.to.split("@")[1] ?? null,
    from: params.from,
    replyTo: params.replyTo ?? null,
    plainTestMode: params.plainTestMode,
    error: summarizeSendGridError(params.error),
  };

  console.error(`[sendgrid] email send failed\n${JSON.stringify(diagnostic, null, 2)}`);
}

export function getPasswordResetSendMode(): PasswordResetSendMode {
  return process.env.SENDGRID_PASSWORD_RESET_PLAIN_TEST === "true"
    ? "plain-test"
    : "template";
}

async function sendTemplateEmail(params: {
  to: string;
  template: TemplateKey;
  subject: string;
  category?: EmailCategory;
  dynamicTemplateData: TemplateData;
  senderProfile?: SenderProfile;
}) {
  const senderProfile = params.senderProfile ?? "default";
  const { from, replyTo, supportEmail } =
    senderProfile === "security" ? getSecurityEmailConfig() : getEmailConfig();
  const category = params.category ?? "transactional";
  const appUrl = resolveAppUrl();
  const headers: Record<string, string> = {};

  if (category === "marketing" && supportEmail) {
    headers["List-Unsubscribe"] = `<mailto:${supportEmail}?subject=unsubscribe>, <${appUrl}/unsubscribe>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    console.info("[email] sending template email", {
      from,
      replyTo: replyTo ?? null,
      template: params.template,
      toDomain: params.to.split("@")[1] ?? null,
    });

    await getSendGridClient().send({
      to: params.to,
      from,
      replyTo,
      subject: params.subject,
      templateId: TEMPLATE_IDS[params.template],
      dynamicTemplateData: cleanTemplateData(params.dynamicTemplateData),
      headers: Object.keys(headers).length ? headers : undefined,
    });
  } catch (error) {
    logSendGridFailure({
      mode: "template",
      template: params.template,
      subject: params.subject,
      to: params.to,
      from,
      replyTo,
      plainTestMode: false,
      error,
    });
    throw error;
  }
}

function buildTemplateData(params: {
  subject: string;
  preheader?: string;
  headline?: string;
  bodyText?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  firstName?: string;
  supportEmail?: string;
  verificationCode?: string;
  resetUrl?: string;
  creditsRemaining?: number;
  jobsCount?: number;
}) {
  return cleanTemplateData({
    email_subject: params.subject,
    email_preheader: params.preheader,
    headline: params.headline,
    body_text: params.bodyText,
    cta_label: params.ctaLabel,
    cta_url: params.ctaUrl,
    first_name: params.firstName,
    support_email: params.supportEmail,
    verification_code: params.verificationCode,
    reset_url: params.resetUrl,
    credits_remaining: params.creditsRemaining,
    jobs_count: params.jobsCount,
  });
}

export async function sendRegistrationConfirmedEmail(to: string, name?: string | null) {
  const subject = "Welcome to Hirexa - your account is ready";
  const { supportEmail } = getEmailConfig();

  await sendTemplateEmail({
    to,
    subject,
    template: "welcome",
    category: WELCOME_EMAIL_CATEGORY,
    dynamicTemplateData: buildTemplateData({
      subject,
      preheader: "Your Hirexa account is ready.",
      headline: "Welcome to Hirexa",
      bodyText:
        "Your account is ready, and you can continue onboarding, explore your dashboard, and start using Hirexa anytime.",
      ctaLabel: "Get started",
      ctaUrl: resolveAppUrl("/dashboard"),
      firstName: getTemplateFirstName(name),
      supportEmail,
    }),
  });
}

export async function sendWelcomeEmail(to: string, name?: string | null) {
  return sendRegistrationConfirmedEmail(to, name);
}

export async function sendVerificationCodeEmail(to: string, code: string) {
  const subject = "Your Hirexa AI verification code";
  const { supportEmail } = getEmailConfig();
  const officialSiteUrl = resolveAppUrl();
  const greeting = "Hi there,";
  const warningParagraph =
    "Only enter this code on an official Hirexa AI app or website. Never share this code with anyone. Sharing it could give someone unauthorized access to your account and any information associated with it.";
  const suspiciousActivityParagraph =
    "If you did not request this code, someone may be trying to access your account. Please reset your password through the official Hirexa AI website.";
  const securityBullets = [
    "Be cautious of suspicious links or messages asking for your login details.",
    "Only sign in through official Hirexa AI pages.",
    "Take steps to secure your account if anything seems unusual.",
  ];

  const text = buildTextBody([
    greeting,
    "",
    "Use the verification code below to continue setting up your Hirexa account. This code expires in 10 minutes.",
    "",
    `Verification code: ${code}`,
    "",
    warningParagraph,
    suspiciousActivityParagraph,
    "",
    "For your security:",
    ...securityBullets.map((item) => `- ${item}`),
    "",
    `Official Hirexa AI website: ${officialSiteUrl}`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa AI Security Team",
  ]);

  const html = buildHirexaEmail({
    greeting,
    title: "Verify your email",
    paragraphs: [
      "Use the verification code below to continue setting up your Hirexa account. This code expires in 10 minutes.",
    ],
    customSections: [
      `
        <div style="margin-top:16px;border:1px solid #dbeafe;border-radius:16px;background:#eff6ff;padding:20px;text-align:center">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#1d4ed8">Security code</div>
          <div style="margin-top:10px;font-size:32px;font-weight:800;letter-spacing:0.28em;color:#0f172a">${escapeHtml(code)}</div>
        </div>
      `,
      `
        <div style="margin-top:16px;border:1px solid #fde68a;border-radius:16px;background:#fffbeb;padding:18px">
          <div style="font-size:16px;font-weight:700;color:#92400e">Account security notice</div>
          <p style="margin:12px 0 0;color:#78350f">${escapeHtml(warningParagraph)}</p>
          <p style="margin:12px 0 0;color:#78350f">${escapeHtml(suspiciousActivityParagraph)}</p>
          <div style="margin-top:14px;font-weight:700;color:#78350f">For your security:</div>
          <ul style="margin:10px 0 0 18px;padding:0;color:#78350f">
            ${securityBullets
              .map((item) => `<li style="margin:0 0 8px">${escapeHtml(item)}</li>`)
              .join("")}
          </ul>
        </div>
      `,
    ],
    footerLines: [
      `Official Hirexa AI website: ${officialSiteUrl}`,
      supportEmail ? `Support: ${supportEmail}` : null,
      "Hirexa AI Security Team",
    ],
  });

  await sendEmail({
    to,
    subject,
    html,
    text,
    category: "transactional",
    senderProfile: "security",
  });
}

export async function sendPasswordChangedEmail(to: string, name?: string | null) {
  const { replyTo, supportEmail } = getEmailConfig();
  const appUrl = resolveAppUrl("/settings/account/password");
  const greeting = formatGreeting(name);
  const subject = "Your Hirexa Password Was Changed";

  const text = buildTextBody([
    greeting,
    "",
    "Your Hirexa account password was successfully changed.",
    "",
    "If you made this change, no further action is required.",
    "If you did not change your password, reset it immediately and contact support.",
    "",
    supportEmail ? `Support: ${supportEmail}` : null,
    `Account settings: ${appUrl}`,
    "",
    "Hirexa AI Security Team",
  ]);

  const html = buildHirexaEmail({
    greeting,
    title: "Password Updated",
    paragraphs: [
      "Your Hirexa account password was successfully changed.",
      "If you made this change, no further action is required.",
      "If you did not change your password, reset it immediately and contact support.",
    ],
    primaryAction: {
      href: appUrl,
      label: "Review your account settings",
    },
    footerLines: [
      "Hirexa AI Security Team",
      replyTo ? `Reply to: ${replyTo}` : null,
      supportEmail ? `Support: ${supportEmail}` : null,
    ],
  });

  await sendEmail({
    to,
    subject,
    html,
    text,
    category: "transactional",
    senderProfile: "security",
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name?: string | null;
  resetUrl: string;
  expiresInMinutes?: number;
}): Promise<PasswordResetSendMode> {
  const subject = "Reset your Hirexa password";
  const { from, replyTo, supportEmail } = getSecurityEmailConfig();
  const expiresInMinutes = params.expiresInMinutes ?? 30;
  const mode = getPasswordResetSendMode();

  if (mode === "plain-test") {
    const greeting = formatGreeting(params.name);
    const text = buildTextBody([
      greeting,
      "",
      `We received a request to reset your Hirexa password. This link expires in ${expiresInMinutes} minutes and can only be used once.`,
      `Reset your password: ${params.resetUrl}`,
      "",
      "If you did not request this, you can ignore this email.",
      supportEmail ? `Support: ${supportEmail}` : null,
      "",
      "Hirexa AI Security Team",
    ]);
    const html = buildHirexaEmail({
      greeting,
      title: "Reset your password",
      paragraphs: [
        `We received a request to reset your Hirexa password. This link expires in ${expiresInMinutes} minutes and can only be used once.`,
        "If you did not request this, you can ignore this email.",
      ],
      primaryAction: {
        href: params.resetUrl,
        label: "Reset your password",
      },
      footerLines: [
        "Hirexa AI Security Team",
        replyTo ? `Reply to: ${replyTo}` : null,
        supportEmail ? `Support: ${supportEmail}` : null,
      ],
    });

    try {
      await sendEmail({
        to: params.to,
        subject,
        html,
        text,
        category: "transactional",
        senderProfile: "security",
      });
      return mode;
    } catch (error) {
      logSendGridFailure({
        mode,
        template: null,
        subject,
        to: params.to,
        from,
        replyTo,
        plainTestMode: true,
        error,
      });
      throw error;
    }
  }

  await sendTemplateEmail({
    to: params.to,
    subject,
    template: "passwordReset",
    senderProfile: "security",
    dynamicTemplateData: buildTemplateData({
      subject,
      preheader: "Use your secure link to choose a new password.",
      headline: "Reset your password",
      bodyText: `We received a request to reset your Hirexa password. This link expires in ${expiresInMinutes} minutes and can only be used once. If you did not request this, you can ignore this email.`,
      ctaLabel: "Reset your password",
      ctaUrl: params.resetUrl,
      firstName: getTemplateFirstName(params.name),
      supportEmail,
      resetUrl: params.resetUrl,
    }),
  });

  return mode;
}

export async function sendProfileCompletedEmail(params: {
  to: string;
  name?: string | null;
}) {
  const subject = "Your Hirexa profile is complete";
  const { supportEmail } = getEmailConfig();

  await sendTemplateEmail({
    to: params.to,
    subject,
    template: "profileCompleted",
    dynamicTemplateData: buildTemplateData({
      subject,
      preheader: "Your profile is ready to power stronger matches and tools.",
      headline: "Profile completed",
      bodyText:
        "Your Hirexa profile is complete. You are ready to explore stronger matches, resume-aware tools, and your dashboard.",
      ctaLabel: "Open your dashboard",
      ctaUrl: resolveAppUrl("/dashboard"),
      firstName: getTemplateFirstName(params.name),
      supportEmail,
    }),
  });
}

export async function sendResumeUploadSuccessEmail(params: {
  to: string;
  name?: string | null;
}) {
  const subject = "Your resume has been uploaded to Hirexa";
  const { supportEmail } = getEmailConfig();

  await sendTemplateEmail({
    to: params.to,
    subject,
    template: "resumeUploadSuccess",
    dynamicTemplateData: buildTemplateData({
      subject,
      preheader: "Your resume upload was successful.",
      headline: "Resume uploaded successfully",
      bodyText:
        "Your resume upload was successful. Hirexa can now use your resume to improve Smart Matches, application support, and coaching recommendations.",
      ctaLabel: "Review your profile",
      ctaUrl: resolveAppUrl("/profile"),
      firstName: getTemplateFirstName(params.name),
      supportEmail,
    }),
  });
}

export async function sendResumeUploadedEmail(params: {
  to: string;
  name?: string | null;
}) {
  return sendResumeUploadSuccessEmail(params);
}

export async function sendCompleteProfileReminderEmail(params: {
  to: string;
  name?: string | null;
}) {
  const subject = "Complete your Hirexa profile for stronger matches";
  const { supportEmail } = getEmailConfig();

  await sendTemplateEmail({
    to: params.to,
    subject,
    template: "completeProfileReminder",
    category: "marketing",
    dynamicTemplateData: buildTemplateData({
      subject,
      preheader: "A few missing details can improve your matches and guidance.",
      headline: "Complete your profile",
      bodyText:
        "Your Hirexa profile is still missing a few basics. Adding your core details helps improve Smart Matches, AI-assisted applications, and personalized guidance.",
      ctaLabel: "Complete your profile",
      ctaUrl: resolveAppUrl("/profile"),
      firstName: getTemplateFirstName(params.name),
      supportEmail,
    }),
  });
}

export async function sendUploadResumeReminderEmail(params: {
  to: string;
  name?: string | null;
}) {
  const subject = "Upload your resume to get more from Hirexa";
  const { supportEmail } = getEmailConfig();

  await sendTemplateEmail({
    to: params.to,
    subject,
    template: "uploadResumeReminder",
    category: "marketing",
    dynamicTemplateData: buildTemplateData({
      subject,
      preheader: "Upload your resume to unlock stronger matches and job tools.",
      headline: "Upload your resume",
      bodyText:
        "You can get stronger Smart Matches and faster AI-assisted job tools once your resume is uploaded.",
      ctaLabel: "Upload your resume",
      ctaUrl: resolveAppUrl("/resume"),
      firstName: getTemplateFirstName(params.name),
      supportEmail,
    }),
  });
}

export async function sendFirstSmartMatchesReadyEmail(params: {
  to: string;
  name?: string | null;
  jobs?: LifecycleJobSummary[];
  jobsCount?: number;
}) {
  const subject = "Your first Smart Matches are ready";
  const { supportEmail } = getEmailConfig();
  const jobsCount = params.jobsCount ?? params.jobs?.length ?? 0;
  const bodyText =
    jobsCount > 0
      ? `Your first ${jobsCount} Smart Match${jobsCount === 1 ? "" : "es"} ${jobsCount === 1 ? "is" : "are"} ready in Hirexa.`
      : "Your first Smart Matches are ready in Hirexa.";

  await sendTemplateEmail({
    to: params.to,
    subject,
    template: "firstSmartMatchesReady",
    category: "marketing",
    dynamicTemplateData: buildTemplateData({
      subject,
      preheader: "Your first Smart Matches are now available in Hirexa.",
      headline: "Your first Smart Matches are ready",
      bodyText,
      ctaLabel: "View Smart Matches",
      ctaUrl: resolveAppUrl("/dashboard"),
      firstName: getTemplateFirstName(params.name),
      supportEmail,
      jobsCount,
    }),
  });
}

export async function sendFirstMatchesReadyEmail(params: {
  to: string;
  name?: string | null;
  jobs: LifecycleJobSummary[];
}) {
  return sendFirstSmartMatchesReadyEmail({
    to: params.to,
    name: params.name,
    jobs: params.jobs,
  });
}

export async function sendJobDigestEmail(params: {
  to: string;
  name?: string | null;
  jobs: LifecycleJobSummary[];
  frequencyLabel?: string | null;
}) {
  const { supportEmail } = getEmailConfig();
  const appUrl = resolveAppUrl("/dashboard");
  const greeting = formatGreeting(params.name);
  const frequencyLabel = (params.frequencyLabel ?? "Today's").trim() || "Today's";
  const subject = `${frequencyLabel} Hirexa job matches`;

  const text = buildTextBody([
    greeting,
    "",
    `${frequencyLabel} matching roles from Hirexa:`,
    ...params.jobs.slice(0, 8).map((job) =>
      `- ${job.title} - ${job.company}${job.location ? ` (${job.location})` : ""}${
        job.jobUrl ? `: ${job.jobUrl}` : ""
      }`
    ),
    "",
    `Review your matches: ${appUrl}`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa",
  ]);

  const html = buildHirexaEmail({
    greeting,
    title: `${frequencyLabel} matching roles`,
    paragraphs: ["Here are the latest roles that align with your Hirexa profile."],
    jobs: params.jobs.slice(0, 8),
    primaryAction: { href: appUrl, label: "Review your matches" },
    footerLines: ["Hirexa", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "marketing" });
}

export async function sendApplicationActivityEmail(params: {
  to: string;
  name?: string | null;
  title: string;
  company?: string | null;
  statusLabel: string;
  details: string;
  actionUrl?: string | null;
}) {
  const { supportEmail } = getEmailConfig();
  const appUrl = params.actionUrl ?? resolveAppUrl("/applications");
  const greeting = formatGreeting(params.name);
  const subject = `Application update: ${params.title}`;
  const companyLine = params.company ? `${params.company}` : "your application";

  const text = buildTextBody([
    greeting,
    "",
    `${params.title} at ${companyLine}: ${params.statusLabel}.`,
    params.details,
    "",
    `Review application: ${appUrl}`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa",
  ]);

  const html = buildHirexaEmail({
    greeting,
    title: `Application update: ${params.title}`,
    paragraphs: [`${params.title} at ${companyLine}: ${params.statusLabel}.`, params.details],
    primaryAction: { href: appUrl, label: "Review application" },
    footerLines: ["Hirexa", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "transactional" });
}

export async function sendInterviewPrepReminderEmail(params: {
  to: string;
  name?: string | null;
  jobTitle: string;
  company?: string | null;
  interviewAt?: Date | string | null;
  focusAreas?: string[];
}) {
  const { supportEmail } = getEmailConfig();
  const appUrl = resolveAppUrl("/job-tools/agents/hirepilot");
  const greeting = formatGreeting(params.name);
  const subject = `Interview prep reminder: ${params.jobTitle}`;
  const companyLine = params.company ? ` with ${params.company}` : "";
  const when = formatDateTime(params.interviewAt);

  const text = buildTextBody([
    greeting,
    "",
    `Your upcoming interview for ${params.jobTitle}${companyLine} is scheduled for ${when}.`,
    "Take a few minutes to review your resume, the role requirements, and your strongest examples.",
    ...(params.focusAreas?.length
      ? ["", "Suggested focus areas:", ...params.focusAreas.map((item) => `- ${item}`)]
      : []),
    "",
    `Open HirePilot: ${appUrl}`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa",
  ]);

  const html = buildHirexaEmail({
    greeting,
    title: "Interview prep reminder",
    paragraphs: [
      `Your upcoming interview for ${params.jobTitle}${companyLine} is scheduled for ${when}.`,
      "Take a few minutes to review your resume, the role requirements, and your strongest examples.",
    ],
    bullets: params.focusAreas ?? [],
    primaryAction: {
      href: appUrl,
      label: "Open HirePilot",
    },
    footerLines: ["Hirexa", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "transactional" });
}

export async function sendCreditsRenewedEmail(params: {
  to: string;
  name?: string | null;
  creditsAdded: number;
  totalAvailable: number;
  sourceLabel: string;
  nextResetAt?: Date | string | null;
  expiresAt?: Date | string | null;
}) {
  const { supportEmail } = getEmailConfig();
  const appUrl = resolveAppUrl("/settings/subscription");
  const greeting = formatGreeting(params.name);
  const subject = "Your HirePilot credits were updated";
  const extraLine =
    params.sourceLabel === "monthly"
      ? `Your next monthly reset is ${formatDate(params.nextResetAt)}.`
      : params.expiresAt
        ? `These added credits are currently set to expire on ${formatDate(params.expiresAt)}.`
        : null;

  const text = buildTextBody([
    greeting,
    "",
    `${params.creditsAdded} HirePilot credits were added to your account.`,
    `You now have ${params.totalAvailable} total credits available.`,
    extraLine,
    "",
    `Review your balance: ${appUrl}`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa",
  ]);

  const html = buildHirexaEmail({
    greeting,
    title: "HirePilot credits updated",
    paragraphs: [
      `${params.creditsAdded} HirePilot credits were added to your account.`,
      `You now have ${params.totalAvailable} total credits available.`,
      ...(extraLine ? [extraLine] : []),
    ],
    primaryAction: {
      href: appUrl,
      label: "Review your balance",
    },
    footerLines: ["Hirexa", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "transactional" });
}

export async function sendInactiveUserComebackEmail(params: {
  to: string;
  name?: string | null;
  daysInactive: number;
}) {
  const subject =
    params.daysInactive >= 14
      ? "Come back to Hirexa when you're ready"
      : "Your Hirexa tools are ready when you are";
  const { supportEmail } = getEmailConfig();

  await sendTemplateEmail({
    to: params.to,
    subject,
    template: "inactiveUserComeback",
    category: "marketing",
    dynamicTemplateData: buildTemplateData({
      subject,
      preheader: "Your profile, Smart Matches, and tools are ready when you return.",
      headline: "Come back when you're ready",
      bodyText: `You have not been active in Hirexa for about ${params.daysInactive} days. If you are still job searching, your profile, Smart Matches, and job tools are ready when you come back.`,
      ctaLabel: "Return to Hirexa",
      ctaUrl: resolveAppUrl("/dashboard"),
      firstName: getTemplateFirstName(params.name),
      supportEmail,
    }),
  });
}

export async function sendInactiveComebackEmail(params: {
  to: string;
  name?: string | null;
  daysInactive: number;
}) {
  return sendInactiveUserComebackEmail(params);
}

export async function sendHirexaCancellationConfirmationEmail(params: {
  to: string;
  name?: string | null;
  endsAt?: Date | string | null;
}) {
  const { supportEmail } = getEmailConfig();
  const appUrl = resolveAppUrl("/settings/subscription");
  const greeting = formatGreeting(params.name);
  const endDate = formatDate(params.endsAt);
  const subject = "Your Hirexa AI cancellation is confirmed";

  const text = buildTextBody([
    greeting,
    "",
    `Your Hirexa AI plan is set to end on ${endDate}.`,
    "You can keep using your current access until then unless you change your billing settings first.",
    "",
    `Manage billing: ${appUrl}`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa AI Billing",
  ]);

  const html = buildHirexaEmail({
    greeting,
    paragraphs: [
      `Your Hirexa AI plan is set to end on ${endDate}.`,
      "You can keep using your current access until then unless you change your billing settings first.",
    ],
    primaryAction: { href: appUrl, label: "Manage billing" },
    footerLines: ["Hirexa AI Billing", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "transactional" });
}

export async function sendHirePilotCancellationConfirmationEmail(params: {
  to: string;
  name?: string | null;
  endsAt?: Date | string | null;
  purchasedCreditsRemaining?: number;
}) {
  const { supportEmail } = getEmailConfig();
  const appUrl = resolveAppUrl("/settings/subscription");
  const greeting = formatGreeting(params.name);
  const endDate = formatDate(params.endsAt);
  const subject = "Your HirePilot cancellation is confirmed";
  const remainingCreditsText =
    typeof params.purchasedCreditsRemaining === "number" && params.purchasedCreditsRemaining > 0
      ? `You still have ${params.purchasedCreditsRemaining} purchased HirePilot credits available until they expire.`
      : null;

  const text = buildTextBody([
    greeting,
    "",
    `Your HirePilot subscription is set to end on ${endDate}.`,
    "You can keep using your current HirePilot access until then unless you change your billing settings first.",
    remainingCreditsText,
    "",
    `Manage HirePilot billing: ${appUrl}`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa AI Billing",
  ]);

  const html = buildHirexaEmail({
    greeting,
    paragraphs: [
      `Your HirePilot subscription is set to end on ${endDate}.`,
      "You can keep using your current HirePilot access until then unless you change your billing settings first.",
      ...(remainingCreditsText ? [remainingCreditsText] : []),
    ],
    primaryAction: {
      href: appUrl,
      label: "Manage HirePilot billing",
    },
    footerLines: ["Hirexa AI Billing", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "transactional" });
}

export async function sendAccountDeletedConfirmationEmail(params: {
  to: string;
  name?: string | null;
  canceledProducts?: string[];
}) {
  const subject = "Your Hirexa AI account deletion is complete";
  const { supportEmail } = getEmailConfig();
  const canceledProducts = Array.isArray(params.canceledProducts)
    ? params.canceledProducts.filter(Boolean)
    : [];
  const bodyText =
    canceledProducts.length > 0
      ? `Your Hirexa AI account and profile data have been deleted. The following services were cancelled as part of deletion: ${canceledProducts.join(", ")}. If you did not request this change, contact support immediately.`
      : "Your Hirexa AI account and profile data have been deleted. If you did not request this change, contact support immediately.";

  await sendTemplateEmail({
    to: params.to,
    subject,
    template: "accountDeletedConfirmation",
    dynamicTemplateData: buildTemplateData({
      subject,
      preheader: "Your Hirexa AI account deletion is complete.",
      headline: "Account deletion complete",
      bodyText,
      firstName: getTemplateFirstName(params.name),
      supportEmail,
    }),
  });
}

export async function sendAccountDeletionConfirmationEmail(params: {
  to: string;
  name?: string | null;
  canceledProducts?: string[];
}) {
  return sendAccountDeletedConfirmationEmail(params);
}

export async function sendHirePilotCreditsExpiringSoonEmail(params: {
  to: string;
  name?: string | null;
  creditsExpiring: number;
  expiresAt: Date | string;
}) {
  const { supportEmail } = getEmailConfig();
  const appUrl = resolveAppUrl("/settings/subscription");
  const greeting = formatGreeting(params.name);
  const expirationDate = formatDate(params.expiresAt);
  const subject = "Your HirePilot credits are expiring soon";

  const text = buildTextBody([
    greeting,
    "",
    `${params.creditsExpiring} HirePilot credits are set to expire on ${expirationDate}.`,
    `Review your balance: ${appUrl}`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa AI Billing",
  ]);

  const html = buildHirexaEmail({
    greeting,
    paragraphs: [
      `${params.creditsExpiring} HirePilot credits are set to expire on ${expirationDate}.`,
    ],
    primaryAction: {
      href: appUrl,
      label: "Review your HirePilot balance",
    },
    footerLines: ["Hirexa AI Billing", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "transactional" });
}

export async function sendCreditsRunningLowEmail(params: {
  to: string;
  name?: string | null;
  creditsRemaining: number;
}) {
  const subject = "Your HirePilot credit balance is running low";
  const { supportEmail } = getEmailConfig();

  await sendTemplateEmail({
    to: params.to,
    subject,
    template: "creditsRunningLow",
    dynamicTemplateData: buildTemplateData({
      subject,
      preheader: "Your HirePilot credit balance is getting low.",
      headline: "Credits running low",
      bodyText: `You have ${params.creditsRemaining} HirePilot credit${params.creditsRemaining === 1 ? "" : "s"} remaining.`,
      ctaLabel: "Review your balance",
      ctaUrl: resolveAppUrl("/settings/subscription"),
      firstName: getTemplateFirstName(params.name),
      supportEmail,
      creditsRemaining: params.creditsRemaining,
    }),
  });
}

export async function sendHirePilotLowCreditWarningEmail(params: {
  to: string;
  name?: string | null;
  creditsRemaining: number;
}) {
  return sendCreditsRunningLowEmail(params);
}
