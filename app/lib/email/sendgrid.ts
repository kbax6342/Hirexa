import { getEmailConfig, sendEmail } from "./mailer";

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

const WELCOME_EMAIL_CATEGORY =
  process.env.WELCOME_EMAIL_CATEGORY === "transactional"
    ? "transactional"
    : "marketing";

export async function sendWelcomeEmail(to: string, name?: string | null) {
  const { appUrl } = getEmailConfig();
  const greeting = formatGreeting(name);

  const subject = "Welcome to Hirexa AI";

  const text = [
    greeting,
    "",
    "Welcome to Hirexa AI. Your account is ready, and you can continue onboarding anytime.",
    "",
    `Get started: ${appUrl}`,
    "",
    "If you did not request this email, you can ignore it.",
    "",
    "Hirexa AI",
    appUrl,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111">
      <p>${greeting}</p>
      <p>Welcome to <strong>Hirexa AI</strong>. Your account is ready, and you can continue onboarding anytime.</p>
      <p><a href="${appUrl}" style="color:#145efc">Get started</a></p>
      <p style="margin-top:24px;color:#6b7280;font-size:12px">
        If you did not request this email, you can ignore it.<br />
        <strong>Hirexa AI</strong> &middot; ${appUrl}
      </p>
    </div>
  `;

  await sendEmail({
    to,
    subject,
    html,
    text,
    category: WELCOME_EMAIL_CATEGORY,
  });
}

export async function sendVerificationCodeEmail(to: string, code: string) {
  const { appUrl } = getEmailConfig();

  const subject = "Your Hirexa AI verification code";

  const text = [
    "Your Hirexa AI verification code is:",
    code,
    "",
    "This code expires in 10 minutes.",
    "",
    "If you did not request this code, you can ignore this email.",
    "",
    "Hirexa AI",
    appUrl,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111">
      <h2 style="margin:0 0 12px">Verify your email</h2>
      <p>Your Hirexa AI verification code is:</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</div>
      <p>This code expires in <strong>10 minutes</strong>.</p>
      <p style="margin-top:24px;color:#6b7280;font-size:12px">
        If you did not request this code, you can ignore this email.<br />
        <strong>Hirexa AI</strong> &middot; ${appUrl}
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

  const text = [
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
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111">
      <p>${greeting}</p>
      <h2 style="margin:0 0 12px">Password Updated</h2>
      <p>Your Hirexa account password was successfully changed.</p>
      <p>If you made this change, no further action is required.</p>
      <p>If you did <strong>not</strong> change your password, reset it immediately and contact support.</p>
      <p>
        <a href="${appUrl}/settings/account/password" style="color:#145efc">
          Review your account settings
        </a>
      </p>
      <p style="margin-top:24px;color:#6b7280;font-size:12px">
        <strong>Hirexa AI Security Team</strong>
        ${supportEmail ? `<br />Support: ${supportEmail}` : ""}
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

export async function sendHirexaCancellationConfirmationEmail(params: {
  to: string;
  name?: string | null;
  endsAt?: Date | string | null;
}) {
  const { appUrl, supportEmail } = getEmailConfig();
  const greeting = formatGreeting(params.name);
  const endDate = formatDate(params.endsAt);
  const subject = "Your Hirexa AI cancellation is confirmed";

  const text = [
    greeting,
    "",
    `Your Hirexa AI plan is set to end on ${endDate}.`,
    "You can keep using your current access until then unless you change your billing settings first.",
    "",
    `Manage billing: ${appUrl}/settings/subscription`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa AI Billing",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111">
      <p>${greeting}</p>
      <p>Your <strong>Hirexa AI</strong> plan is set to end on <strong>${endDate}</strong>.</p>
      <p>You can keep using your current access until then unless you change your billing settings first.</p>
      <p><a href="${appUrl}/settings/subscription" style="color:#145efc">Manage billing</a></p>
      <p style="margin-top:24px;color:#6b7280;font-size:12px">
        <strong>Hirexa AI Billing</strong>
        ${supportEmail ? `<br />Support: ${supportEmail}` : ""}
      </p>
    </div>
  `;

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

  const text = [
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
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111">
      <p>${greeting}</p>
      <p>Your <strong>HirePilot</strong> subscription is set to end on <strong>${endDate}</strong>.</p>
      <p>You can keep using your current HirePilot access until then unless you change your billing settings first.</p>
      ${
        remainingCreditsText
          ? `<p>${remainingCreditsText}</p>`
          : ""
      }
      <p><a href="${appUrl}/settings/subscription" style="color:#145efc">Manage HirePilot billing</a></p>
      <p style="margin-top:24px;color:#6b7280;font-size:12px">
        <strong>Hirexa AI Billing</strong>
        ${supportEmail ? `<br />Support: ${supportEmail}` : ""}
      </p>
    </div>
  `;

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

  const text = [
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
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111">
      <p>${greeting}</p>
      <p>Your <strong>Hirexa AI</strong> account and profile data have been deleted.</p>
      ${
        canceledProducts.length > 0
          ? `<p>The following services were cancelled as part of deletion: <strong>${canceledProducts.join(", ")}</strong>.</p>`
          : ""
      }
      <p>If you did not request this change, contact support immediately.</p>
      <p style="margin-top:24px;color:#6b7280;font-size:12px">
        <strong>Hirexa AI</strong>
        ${supportEmail ? `<br />Support: ${supportEmail}` : ""}
      </p>
    </div>
  `;

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

  const text = [
    greeting,
    "",
    `${params.creditsExpiring} HirePilot credits are set to expire on ${expirationDate}.`,
    `Review your balance: ${appUrl}/settings/subscription`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa AI Billing",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111">
      <p>${greeting}</p>
      <p><strong>${params.creditsExpiring} HirePilot credits</strong> are set to expire on <strong>${expirationDate}</strong>.</p>
      <p><a href="${appUrl}/settings/subscription" style="color:#145efc">Review your HirePilot balance</a></p>
      <p style="margin-top:24px;color:#6b7280;font-size:12px">
        <strong>Hirexa AI Billing</strong>
        ${supportEmail ? `<br />Support: ${supportEmail}` : ""}
      </p>
    </div>
  `;

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

  const text = [
    greeting,
    "",
    `You have ${params.creditsRemaining} HirePilot credits remaining.`,
    `Review your balance: ${appUrl}/settings/subscription`,
    supportEmail ? `Support: ${supportEmail}` : null,
    "",
    "Hirexa AI Billing",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111">
      <p>${greeting}</p>
      <p>You have <strong>${params.creditsRemaining} HirePilot credits</strong> remaining.</p>
      <p><a href="${appUrl}/settings/subscription" style="color:#145efc">Review your HirePilot balance</a></p>
      <p style="margin-top:24px;color:#6b7280;font-size:12px">
        <strong>Hirexa AI Billing</strong>
        ${supportEmail ? `<br />Support: ${supportEmail}` : ""}
      </p>
    </div>
  `;

  await sendEmail({ to: params.to, subject, html, text, category: "transactional" });
}
