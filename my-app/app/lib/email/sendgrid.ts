import sgMail from "@sendgrid/mail";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM = process.env.SENDGRID_FROM; // e.g. "Hirexa <hirexa@gmail.com>"

if (!SENDGRID_API_KEY) throw new Error("Missing SENDGRID_API_KEY");
if (!SENDGRID_FROM) throw new Error("Missing SENDGRID_FROM");

sgMail.setApiKey(SENDGRID_API_KEY);

export async function sendWelcomeEmail(to: string, name?: string | null) {
  const safeName = (name ?? "").trim();

  await sgMail.send({
    to,
    from: SENDGRID_FROM,
    subject: "Welcome to Hirexa!",
    text: `Welcome${safeName ? `, ${safeName}` : ""} — thanks for signing up to Hirexa.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Welcome${safeName ? `, ${safeName}` : ""}!</h2>
        <p>Thanks for signing up to <b>Hirexa</b>.</p>
        <p>You’re all set ✅</p>
      </div>
    `,
  });
}
