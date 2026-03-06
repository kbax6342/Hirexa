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

export async function sendVerificationCodeEmail(to: string, code: string) {
  await sgMail.send({
    to,
    from: SENDGRID_FROM,
    subject: "Your Hirexa verification code",
    text: `Your Hirexa verification code is ${code}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Verify your email</h2>
        <p>Your Hirexa verification code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
        <p>This code expires in <b>10 minutes</b>.</p>
      </div>
    `,
  });
}
