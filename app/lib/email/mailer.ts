import sgMail from "@sendgrid/mail";

import { getEmailConfig } from "./config";

type EmailCategory = "transactional" | "marketing";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  category?: EmailCategory;
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
export { getEmailConfig } from "./config";

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
