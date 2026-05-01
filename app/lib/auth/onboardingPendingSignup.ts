export const ONBOARDING_PENDING_SIGNUP_KEY = "hirexa:onboarding-pending-signup";

export type PendingOnboardingSignup = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  verificationChannel: "email" | "sms";
};

export function readPendingOnboardingSignup(): PendingOnboardingSignup | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_PENDING_SIGNUP_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingOnboardingSignup> | null;
    const firstName = String(parsed?.firstName ?? "").trim();
    const lastName = String(parsed?.lastName ?? "").trim();
    const email = String(parsed?.email ?? "").trim();
    const phone = String(parsed?.phone ?? "").trim();
    const password = String(parsed?.password ?? "");
    const verificationChannel =
      parsed?.verificationChannel === "sms" ? "sms" : "email";

    if (!firstName || !lastName || !email || !password) {
      return null;
    }

    return {
      firstName,
      lastName,
      email,
      phone,
      password,
      verificationChannel,
    };
  } catch {
    return null;
  }
}

export function writePendingOnboardingSignup(
  payload: PendingOnboardingSignup
) {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(
    ONBOARDING_PENDING_SIGNUP_KEY,
    JSON.stringify(payload)
  );
}

export function clearPendingOnboardingSignup() {
  if (typeof window === "undefined") return;

  window.sessionStorage.removeItem(ONBOARDING_PENDING_SIGNUP_KEY);
}
