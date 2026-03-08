import sgMail from "@sendgrid/mail";

type EmailCategory = "transactional" | "marketing";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  category?: EmailCategory;
};

// Sender examples (verified in SendGrid):
// - Hirexa AI <no-reply@mail.hirexa.ai>
// - Hirexa AI <welcome@mail.hirexa.ai>
// - Hirexa AI <hello@updates.hirexa.ai>

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

function isFullFrom(value: string) {
  return value.includes("<") && value.includes(">") && value.includes("@");
}

function buildFromAddress() {
  const raw = (process.env.EMAIL_FROM ?? process.env.SENDGRID_FROM ?? "").trim();
  if (!raw) {
    throw new Error("Missing EMAIL_FROM (or SENDGRID_FROM fallback)");
  }

  return isFullFrom(raw) ? raw : `Hirexa AI <${raw}>`;
}

function buildReplyTo() {
  const replyTo = (process.env.EMAIL_REPLY_TO ?? process.env.EMAIL_SUPPORT ?? "").trim();
  return replyTo || undefined;
}

function getAppUrl() {
  return (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getEmailConfig() {
  return {
    from: buildFromAddress(),
    replyTo: buildReplyTo(),
    supportEmail: (process.env.EMAIL_SUPPORT ?? "").trim() || undefined,
    appUrl: getAppUrl(),
  };
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  category = "transactional",
}: SendEmailParams) {
  const { from, replyTo, supportEmail, appUrl } = getEmailConfig();
  const finalText = text && text.trim().length > 0 ? text : stripHtml(html);

  const headers: Record<string, string> = {};

  if (category === "marketing" && supportEmail && appUrl) {
    // List-Unsubscribe headers should only be used for marketing/promotional emails.
    headers["List-Unsubscribe"] = `<mailto:${supportEmail}?subject=unsubscribe>, <${appUrl}/unsubscribe>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  await getSendGridClient().send({
    to,
    from,
    subject,
    html,
    text: finalText,
    replyTo,
    headers: Object.keys(headers).length ? headers : undefined,
  });
}
