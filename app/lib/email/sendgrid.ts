import { getEmailConfig, sendEmail } from "./mailer";

type LifecycleJobSummary = {
  title: string;
  company: string;
  location?: string | null;
  jobUrl?: string | null;
};

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
      const label = [job.company, job.location].filter(Boolean).join(" • ");
      const title = escapeHtml(job.title);
      const meta = label ? `<div style="color:#6b7280;font-size:13px">${escapeHtml(label)}</div>` : "";
      const cta = job.jobUrl
        ? `<div style="margin-top:6px"><a href="${escapeHtml(job.jobUrl)}" style="color:#145efc">View role</a></div>`
        : "";

      return `
        <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin:0 0 12px">
          <div style="font-weight:700;color:#111827">${title}</div>
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
      ${params.jobs?.length ? `<div style="margin-top:16px">${renderJobs(params.jobs)}</div>` : ""}
      ${primaryAction}
      ${footer}
    </div>
  `;
}

const WELCOME_EMAIL_CATEGORY =
  process.env.WELCOME_EMAIL_CATEGORY === "transactional"
    ? "transactional"
    : "marketing";

export async function sendRegistrationConfirmedEmail(to: string, name?: string | null) {
  const { appUrl } = getEmailConfig();
  const greeting = formatGreeting(name);
  const subject = "Welcome to Hirexa — your account is ready";

  const text = buildTextBody([
    greeting,
    "",
    "Welcome to Hirexa. Your account is ready, and you can continue onboarding anytime.",
    "",
    `Get started: ${appUrl}`,
    "",
    "If you did not request this email, you can ignore it.",
    "",
    "Hirexa",
    appUrl,
  ]);

  const html = buildHirexaEmail({
    greeting,
    paragraphs: [
      "Welcome to Hirexa. Your account is ready, and you can continue onboarding anytime.",
    ],
    primaryAction: { href: appUrl, label: "Get started" },
    footerLines: ["If you did not request this email, you can ignore it.", `Hirexa • ${appUrl}`],
  });

  await sendEmail({
    to,
    subject,
    html,
    text,
    category: WELCOME_EMAIL_CATEGORY,
  });
}

export async function sendWelcomeEmail(to: string, name?: string | null) {
  return sendRegistrationConfirmedEmail(to, name);
}

export async function sendVerificationCodeEmail(to: string, code: string) {
  const { appUrl } = getEmailConfig();
  const subject = "Your Hirexa AI verification code";

  const text = buildTextBody([
    "Your Hirexa AI verification code is:",
    code,
    "",
    "This code expires in 10 minutes.",
    "",
    "If you did not request this code, you can ignore this email.",
    "",
    "Hirexa AI",
    appUrl,
  ]);

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111">
      <h2 style="margin:0 0 12px">Verify your email</h2>
      <p>Your Hirexa AI verification code is:</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${escapeHtml(
        code
      )}</div>
      <p>This code expires in <strong>10 minutes</strong>.</p>
      <p style="margin-top:24px;color:#6b7280;font-size:12px">
        If you did not request this code, you can ignore this email.<br />
        <strong>Hirexa AI</strong> &middot; ${escapeHtml(appUrl)}
      </p>
    </div>
  `;

  await sendEmail({
    to,
    subject,
    html,
    text,
    category: "transactional",
  });
}

export async function sendPasswordChangedEmail(to: string, name?: string | null) {
  const { appUrl, supportEmail } = getEmailConfig();
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
    `Account settings: ${appUrl}/settings/account/password`,
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
      href: `${appUrl}/settings/account/password`,
      label: "Review your account settings",
    },
    footerLines: [
      "Hirexa AI Security Team",
      supportEmail ? `Support: ${supportEmail}` : null,
    ],
  });

  await sendEmail({
    to,
    subject,
    html,
    text,
    category: "transactional",
  });
}

export async function sendResumeUploadedEmail(params: {
  to: string;
  name?: string | null;
}) {
  const { appUrl, supportEmail } = getEmailConfig();
  const greeting = formatGreeting(params.name);
  const subject = "Your resume has been uploaded to Hirexa";

  const text = buildTextBody([
    greeting,
    "",
    "Your resume upload was successful.",
    "Hirexa can now use your resume to improve Smart Matches, application support, and coaching recommendations.",
    "",
    `Review your profile: ${appUrl}/profile`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa",
  ]);

  const html = buildHirexaEmail({
    greeting,
    title: "Resume uploaded successfully",
    paragraphs: [
      "Your resume upload was successful.",
      "Hirexa can now use your resume to improve Smart Matches, application support, and coaching recommendations.",
    ],
    primaryAction: { href: `${appUrl}/profile`, label: "Review your profile" },
    footerLines: ["Hirexa", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "transactional" });
}

export async function sendCompleteProfileReminderEmail(params: {
  to: string;
  name?: string | null;
}) {
  const { appUrl, supportEmail } = getEmailConfig();
  const greeting = formatGreeting(params.name);
  const subject = "Complete your Hirexa profile for stronger matches";

  const text = buildTextBody([
    greeting,
    "",
    "Your Hirexa profile is still missing a few basics.",
    "Adding your core details helps improve Smart Matches, AI-assisted applications, and personalized guidance.",
    "",
    `Complete your profile: ${appUrl}/profile`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa",
  ]);

  const html = buildHirexaEmail({
    greeting,
    title: "Complete your profile",
    paragraphs: [
      "Your Hirexa profile is still missing a few basics.",
      "Adding your core details helps improve Smart Matches, AI-assisted applications, and personalized guidance.",
    ],
    primaryAction: { href: `${appUrl}/profile`, label: "Complete your profile" },
    footerLines: ["Hirexa", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "marketing" });
}

export async function sendUploadResumeReminderEmail(params: {
  to: string;
  name?: string | null;
}) {
  const { appUrl, supportEmail } = getEmailConfig();
  const greeting = formatGreeting(params.name);
  const subject = "Upload your resume to get more from Hirexa";

  const text = buildTextBody([
    greeting,
    "",
    "You can get stronger Smart Matches and faster AI-assisted job tools once your resume is uploaded.",
    "",
    `Upload your resume: ${appUrl}/resume`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa",
  ]);

  const html = buildHirexaEmail({
    greeting,
    title: "Upload your resume",
    paragraphs: [
      "You can get stronger Smart Matches and faster AI-assisted job tools once your resume is uploaded.",
    ],
    primaryAction: { href: `${appUrl}/resume`, label: "Upload your resume" },
    footerLines: ["Hirexa", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "marketing" });
}

export async function sendFirstMatchesReadyEmail(params: {
  to: string;
  name?: string | null;
  jobs: LifecycleJobSummary[];
}) {
  const { appUrl, supportEmail } = getEmailConfig();
  const greeting = formatGreeting(params.name);
  const subject = "Your first Smart Matches are ready";

  const text = buildTextBody([
    greeting,
    "",
    "Your first Smart Matches are ready in Hirexa.",
    ...params.jobs.slice(0, 5).map((job) =>
      `- ${job.title} — ${job.company}${job.location ? ` (${job.location})` : ""}${
        job.jobUrl ? `: ${job.jobUrl}` : ""
      }`
    ),
    "",
    `View Smart Matches: ${appUrl}/dashboard`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa",
  ]);

  const html = buildHirexaEmail({
    greeting,
    title: "Your first Smart Matches are ready",
    paragraphs: ["We found your first personalized roles in Hirexa."],
    jobs: params.jobs.slice(0, 5),
    primaryAction: { href: `${appUrl}/dashboard`, label: "View Smart Matches" },
    footerLines: ["Hirexa", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "marketing" });
}

export async function sendJobDigestEmail(params: {
  to: string;
  name?: string | null;
  jobs: LifecycleJobSummary[];
  frequencyLabel?: string | null;
}) {
  const { appUrl, supportEmail } = getEmailConfig();
  const greeting = formatGreeting(params.name);
  const frequencyLabel = (params.frequencyLabel ?? "Today’s").trim() || "Today’s";
  const subject = `${frequencyLabel} Hirexa job matches`;

  const text = buildTextBody([
    greeting,
    "",
    `${frequencyLabel} matching roles from Hirexa:`,
    ...params.jobs.slice(0, 8).map((job) =>
      `- ${job.title} — ${job.company}${job.location ? ` (${job.location})` : ""}${
        job.jobUrl ? `: ${job.jobUrl}` : ""
      }`
    ),
    "",
    `Review your matches: ${appUrl}/dashboard`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa",
  ]);

  const html = buildHirexaEmail({
    greeting,
    title: `${frequencyLabel} matching roles`,
    paragraphs: ["Here are the latest roles that align with your Hirexa profile."],
    jobs: params.jobs.slice(0, 8),
    primaryAction: { href: `${appUrl}/dashboard`, label: "Review your matches" },
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
  const { appUrl, supportEmail } = getEmailConfig();
  const greeting = formatGreeting(params.name);
  const subject = `Application update: ${params.title}`;
  const actionUrl = params.actionUrl ?? `${appUrl}/applications`;
  const companyLine = params.company ? `${params.company}` : "your application";

  const text = buildTextBody([
    greeting,
    "",
    `${params.title} at ${companyLine}: ${params.statusLabel}.`,
    params.details,
    "",
    `Review application: ${actionUrl}`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa",
  ]);

  const html = buildHirexaEmail({
    greeting,
    title: `Application update: ${params.title}`,
    paragraphs: [`${params.title} at ${companyLine}: ${params.statusLabel}.`, params.details],
    primaryAction: { href: actionUrl, label: "Review application" },
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
  const { appUrl, supportEmail } = getEmailConfig();
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
    `Open HirePilot: ${appUrl}/job-tools/agents/hirepilot`,
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
      href: `${appUrl}/job-tools/agents/hirepilot`,
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
  const { appUrl, supportEmail } = getEmailConfig();
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
    `Review your balance: ${appUrl}/settings/subscription`,
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
      href: `${appUrl}/settings/subscription`,
      label: "Review your balance",
    },
    footerLines: ["Hirexa", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "transactional" });
}

export async function sendInactiveComebackEmail(params: {
  to: string;
  name?: string | null;
  daysInactive: number;
}) {
  const { appUrl, supportEmail } = getEmailConfig();
  const greeting = formatGreeting(params.name);
  const subject =
    params.daysInactive >= 14
      ? "Come back to Hirexa when you’re ready"
      : "Your Hirexa tools are ready when you are";

  const text = buildTextBody([
    greeting,
    "",
    `You haven’t been active in Hirexa for about ${params.daysInactive} days.`,
    "If you are still job searching, your profile, Smart Matches, and job tools are ready when you come back.",
    "",
    `Return to Hirexa: ${appUrl}/dashboard`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa",
  ]);

  const html = buildHirexaEmail({
    greeting,
    title: "Come back when you’re ready",
    paragraphs: [
      `You haven’t been active in Hirexa for about ${params.daysInactive} days.`,
      "If you are still job searching, your profile, Smart Matches, and job tools are ready when you come back.",
    ],
    primaryAction: { href: `${appUrl}/dashboard`, label: "Return to Hirexa" },
    footerLines: ["Hirexa", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "marketing" });
}

export async function sendHirexaCancellationConfirmationEmail(params: {
  to: string;
  name?: string | null;
  endsAt?: Date | string | null;
}) {
  const { appUrl, supportEmail } = getEmailConfig();
  const greeting = formatGreeting(params.name);
  const endDate = formatDate(params.endsAt);
  const subject = "Your Hirexa AI cancellation is confirmed";

  const text = buildTextBody([
    greeting,
    "",
    `Your Hirexa AI plan is set to end on ${endDate}.`,
    "You can keep using your current access until then unless you change your billing settings first.",
    "",
    `Manage billing: ${appUrl}/settings/subscription`,
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
    primaryAction: { href: `${appUrl}/settings/subscription`, label: "Manage billing" },
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
  const { appUrl, supportEmail } = getEmailConfig();
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
    `Manage HirePilot billing: ${appUrl}/settings/subscription`,
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
      href: `${appUrl}/settings/subscription`,
      label: "Manage HirePilot billing",
    },
    footerLines: ["Hirexa AI Billing", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "transactional" });
}

export async function sendAccountDeletionConfirmationEmail(params: {
  to: string;
  name?: string | null;
  canceledProducts?: string[];
}) {
  const { appUrl, supportEmail } = getEmailConfig();
  const greeting = formatGreeting(params.name);
  const canceledProducts = Array.isArray(params.canceledProducts)
    ? params.canceledProducts.filter(Boolean)
    : [];
  const subject = "Your Hirexa AI account deletion is complete";

  const text = buildTextBody([
    greeting,
    "",
    "Your Hirexa AI account and profile data have been deleted.",
    canceledProducts.length > 0
      ? `The following services were cancelled as part of deletion: ${canceledProducts.join(", ")}.`
      : null,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "If you did not request this change, contact support immediately.",
    "",
    "Hirexa AI",
    appUrl,
  ]);

  const html = buildHirexaEmail({
    greeting,
    paragraphs: [
      "Your Hirexa AI account and profile data have been deleted.",
      ...(canceledProducts.length > 0
        ? [`The following services were cancelled as part of deletion: ${canceledProducts.join(", ")}.`]
        : []),
      "If you did not request this change, contact support immediately.",
    ],
    footerLines: ["Hirexa AI", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "transactional" });
}

export async function sendHirePilotCreditsExpiringSoonEmail(params: {
  to: string;
  name?: string | null;
  creditsExpiring: number;
  expiresAt: Date | string;
}) {
  const { appUrl, supportEmail } = getEmailConfig();
  const greeting = formatGreeting(params.name);
  const expirationDate = formatDate(params.expiresAt);
  const subject = "Your HirePilot credits are expiring soon";

  const text = buildTextBody([
    greeting,
    "",
    `${params.creditsExpiring} HirePilot credits are set to expire on ${expirationDate}.`,
    `Review your balance: ${appUrl}/settings/subscription`,
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
      href: `${appUrl}/settings/subscription`,
      label: "Review your HirePilot balance",
    },
    footerLines: ["Hirexa AI Billing", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "transactional" });
}

export async function sendHirePilotLowCreditWarningEmail(params: {
  to: string;
  name?: string | null;
  creditsRemaining: number;
}) {
  const { appUrl, supportEmail } = getEmailConfig();
  const greeting = formatGreeting(params.name);
  const subject = "Your HirePilot credit balance is running low";

  const text = buildTextBody([
    greeting,
    "",
    `You have ${params.creditsRemaining} HirePilot credits remaining.`,
    `Review your balance: ${appUrl}/settings/subscription`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa AI Billing",
  ]);

  const html = buildHirexaEmail({
    greeting,
    paragraphs: [`You have ${params.creditsRemaining} HirePilot credits remaining.`],
    primaryAction: {
      href: `${appUrl}/settings/subscription`,
      label: "Review your HirePilot balance",
    },
    footerLines: ["Hirexa AI Billing", supportEmail ? `Support: ${supportEmail}` : null],
  });

  await sendEmail({ to: params.to, subject, html, text, category: "transactional" });
}
