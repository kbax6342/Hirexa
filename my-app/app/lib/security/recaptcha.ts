type RecaptchaResponse = {
  success: boolean;
  score: number;
  action: string;
};

export async function verifyRecaptchaV3(token: string | null, expectedAction: string) {
  if (!token) {
    return { ok: false, error: "Missing reCAPTCHA token" };
  }

  // Bypass in non-production to unblock local and Incognito testing.
  if (process.env.NODE_ENV !== "production") {
    console.log("[recaptcha] bypassed in non-production environment");
    return { ok: true, score: 0.9, devBypass: true as const };
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY ?? process.env.RECAPTCHA_SECRET;
  if (!secret) {
    return { ok: false, error: "Missing RECAPTCHA_SECRET_KEY/RECAPTCHA_SECRET" };
  }

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);

  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const data = (await res.json()) as RecaptchaResponse;

  if (!data.success) {
    return { ok: false, error: "reCAPTCHA failed" };
  }

  if (data.action !== expectedAction) {
    return { ok: false, error: "reCAPTCHA action mismatch" };
  }

  if (data.score < 0.5) {
    return { ok: false, error: "reCAPTCHA score too low" };
  }

  return { ok: true, score: data.score };
}
