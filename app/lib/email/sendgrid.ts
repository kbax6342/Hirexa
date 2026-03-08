import { getEmailConfig, sendEmail } from "./mailer";

function normalizeName(name?: string | null) {
  return (name ?? "").trim();
}

function formatGreeting(name?: string | null) {
  const safeName = normalizeName(name);
  return safeName ? `Hi ${safeName},` : "Hi there,";
}

const WELCOME_EMAIL_CATEGORY =
  process.env.WELCOME_EMAIL_CATEGORY === "transactional" ? "transactional" : "marketing";

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
        <strong>Hirexa AI</strong> � ${appUrl}
      </p>
    </div>
  `;

  await sendEmail({
    to,
    subject,
    html,
    text,
    // Welcome emails can be marketing or transactional depending on your policy.
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
        <strong>Hirexa AI</strong> � ${appUrl}
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
