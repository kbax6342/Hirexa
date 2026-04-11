import sgMail from "@sendgrid/mail";

import { getEmailConfig, getSecurityEmailConfig } from "./config";
import { normalizeEmailError } from "./errorDiagnostics";

type EmailCategory = "transactional" | "marketing";
type SenderProfile = "default" | "security";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  category?: EmailCategory;
  senderProfile?: SenderProfile;
};

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

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export { getEmailConfig, getSecurityEmailConfig } from "./config";

export async function sendEmail({
  to,
  subject,
  html,
  text,
  category = "transactional",
  senderProfile = "default",
}: SendEmailParams) {
  const { from, replyTo, supportEmail, appUrl } =
    senderProfile === "security" ? getSecurityEmailConfig() : getEmailConfig();
  const finalText = text && text.trim().length > 0 ? text : stripHtml(html);

  const headers: Record<string, string> = {};

  if (category === "marketing" && supportEmail && appUrl) {
    // List-Unsubscribe headers should only be used for marketing/promotional emails.
    headers["List-Unsubscribe"] = `<mailto:${supportEmail}?subject=unsubscribe>, <${appUrl}/unsubscribe>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  console.info("[email] sending direct email", {
    from,
    replyTo: replyTo ?? null,
    template: null,
    toDomain: to.split("@")[1] ?? null,
  });

  try {
    await getSendGridClient().send({
      to,
      from,
      subject,
      html,
      text: finalText,
      replyTo,
      headers: Object.keys(headers).length ? headers : undefined,
    });
  } catch (error) {
    const diagnostic = await normalizeEmailError(error);
    const logPrefix = subject.startsWith("Application update:")
      ? "[AUTO_APPLY_EMAIL]"
      : "[EMAIL_PROVIDER]";

    console.error(`${logPrefix} direct email send failed`, {
      category,
      senderProfile,
      subject,
      toDomain: to.split("@")[1] ?? null,
      from,
      replyTo: replyTo ?? null,
      diagnostic,
    });
    throw error;
  }
}
