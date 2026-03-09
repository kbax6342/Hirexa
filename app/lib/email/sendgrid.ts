import { getEmailConfig, sendEmail } from "./mailer";

function normalizeName(name?: string | null) {
  return (name ?? "").trim();
}

function formatGreeting(name?: string | null) {
  const safeName = normalizeName(name);
  return safeName ? `Hi ${safeName},` : "Hi there,";
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
    `Account settings: ${appUrl}/dashboard/settings/account/password`,
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
        <a href="${appUrl}/dashboard/settings/account/password" style="color:#145efc">
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
