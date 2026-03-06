// File: /Hirexa/my-app/app/components/auth/SplitAuthCard.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

type Step = "signup" | "peek" | "verify";

function scorePassword(pw: string) {
  const rules = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /\d/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };

  const passed = Object.values(rules).filter(Boolean).length;
  const label =
    passed <= 2 ? "Weak" : passed === 3 ? "Okay" : passed === 4 ? "Good" : "Strong";

  return { rules, passed, label };
}

function stepToTranslate(step: Step) {
  if (step === "signup") return "translate-x-0";
  if (step === "peek") return "-translate-x-1/3";
  return "-translate-x-2/3";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

function OtpBoxes({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: () => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  function setAt(index: number, char: string) {
    const clean = char.replace(/\D/g, "").slice(-1);
    const nextArr = digits.slice();
    nextArr[index] = clean;

    const next = nextArr.join("").slice(0, 6);
    onChange(next);

    if (clean && index < 5) {
      refs.current[index + 1]?.focus();
    }

    if (nextArr.every(Boolean) && onComplete) {
      onComplete();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === "Backspace") {
      e.preventDefault();

      if (digits[index]) {
        const nextArr = digits.slice();
        nextArr[index] = "";
        onChange(nextArr.join(""));
      } else if (index > 0) {
        refs.current[index - 1]?.focus();
        const nextArr = digits.slice();
        nextArr[index - 1] = "";
        onChange(nextArr.join(""));
      }

      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (index > 0) refs.current[index - 1]?.focus();
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (index < 5) refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();

    const text = e.clipboardData.getData("text") ?? "";
    const only = text.replace(/\D/g, "").slice(0, 6);
    if (!only) return;

    onChange(only);

    const nextIndex = Math.min(only.length, 6) - 1;
    refs.current[nextIndex]?.focus();

    if (only.length === 6 && onComplete) {
      onComplete();
    }
  }

  return (
    <div className="mt-3 flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={handlePaste}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          disabled={disabled}
          maxLength={1}
          className={[
            "h-12 w-12 rounded-xl border border-gray-200 bg-white text-center text-lg font-semibold text-gray-900",
            "focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30",
            disabled ? "opacity-60" : "",
          ].join(" ")}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}

export default function SplitAuthCard() {
  const { executeRecaptcha } = useGoogleReCaptcha();
  const router = useRouter();

  const [step, setStep] = useState<Step>("signup");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [foundCount] = useState<number>(127);
  const [teaserJobs] = useState(() => [
    { title: "Software Engineer", company: "Nimbus Labs", location: "Remote (US)" },
    { title: "Project Manager", company: "BluePeak", location: "Chicago, IL" },
    { title: "Data Analyst", company: "Orbit Systems", location: "Pontiac, MI" },
    { title: "Marketing Specialist", company: "Skyline Co.", location: "Charlotte, NC" },
    { title: "Customer Support", company: "Pulse AI", location: "Hybrid" },
  ]);

  const pwScore = useMemo(() => scorePassword(pw), [pw]);

  const canContinue =
    email.trim().includes("@") &&
    pwScore.passed >= 4 &&
    pw.length > 0 &&
    pw === pw2;

  async function getRecaptchaToken(action: "signup_init" | "signup_verify") {
    const isDev = process.env.NODE_ENV !== "production";

    if (executeRecaptcha) {
      return await executeRecaptcha(action);
    }

    if (isDev) {
      console.warn(`[SplitAuthCard] reCAPTCHA not ready for ${action}; using dev fallback token.`);
      return "dev-recaptcha-bypass";
    }

    throw new Error("Security check not ready. Please wait a moment and try again.");
  }

  async function startSignup() {
    setMsg(null);
    setLoading(true);

    try {
      const recaptchaToken = await getRecaptchaToken("signup_init");

      const res = await fetch("/api/auth/register/init", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password: pw,
          recaptchaToken,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to start signup");
      }

      setStep("peek");
      setMsg("We sent a 6-digit verification code to your email.");
    } catch (e: unknown) {
      setMsg(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setMsg(null);
    setLoading(true);

    try {
      if (otp.length !== 6) {
        throw new Error("Enter the 6-digit verification code.");
      }

      const recaptchaToken = await getRecaptchaToken("signup_verify");

      const res = await fetch("/api/auth/register/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: otp,
          recaptchaToken,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error ?? "Verification failed");
      }

      const login = await authClient.signIn.emailPassword({
        email: email.trim(),
        password: pw,
        redirect: false,
        callbackUrl: "/onboarding/profile",
      });

      if (login.error) {
        throw new Error("Email verified, but automatic sign-in failed. Please log in.");
      }

      router.push("/onboarding/profile");
    } catch (e: unknown) {
      setMsg(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-white shadow-glow">
      <div className="relative">
        <div className="overflow-hidden">
          <div
            className={[
              "flex w-[300%] transition-transform duration-500 ease-in-out",
              stepToTranslate(step),
            ].join(" ")}
          >
            <div className="w-1/3 p-8 md:p-10">
              <h3 className="text-2xl font-semibold text-gray-900">Create account</h3>
              <p className="mt-1 text-gray-500">
                Enter a secure password and verify your email.
              </p>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="Email address"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-black placeholder-black/60 focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Password</label>
                  <input
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    type="password"
                    placeholder="Password"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-black placeholder-black/60 focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30"
                  />

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Strength</span>
                      <span
                        className={[
                          "font-medium",
                          pwScore.label === "Weak"
                            ? "text-red-500"
                            : pwScore.label === "Okay"
                              ? "text-amber-500"
                              : pwScore.label === "Good"
                                ? "text-hirexa-cyan"
                                : "text-hirexa-blue",
                        ].join(" ")}
                      >
                        {pwScore.label}
                      </span>
                    </div>

                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-hirexa-blue transition-all"
                        style={{ width: `${(pwScore.passed / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Confirm password</label>
                  <input
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    type="password"
                    placeholder="Confirm password"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-black placeholder-black/60 focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30"
                  />
                  {pw2.length > 0 && pw !== pw2 && (
                    <div className="mt-1 text-xs text-red-600">Passwords do not match.</div>
                  )}
                </div>

                {msg && <div className="text-sm text-gray-700">{msg}</div>}

                <button
                  disabled={!canContinue || loading}
                  onClick={startSignup}
                  className={[
                    "w-full rounded-xl py-3 font-semibold text-white transition",
                    !canContinue || loading
                      ? "cursor-not-allowed bg-gray-300"
                      : "bg-hirexa-blue hover:bg-hirexa-cyan",
                  ].join(" ")}
                >
                  {loading ? "Sending code..." : "Continue"}
                </button>

                <div className="text-center text-sm text-gray-500">
                  Already have an account?{" "}
                  <a className="text-hirexa-blue hover:underline" href="/login">
                    Log in
                  </a>
                </div>
              </div>
            </div>

            <div className="w-1/3 p-8 md:p-10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900">Jobs found</h3>
                  <p className="mt-1 text-gray-500">
                    We found{" "}
                    <span className="font-semibold text-gray-900">{foundCount}</span> jobs near
                    your locations.
                  </p>
                </div>

                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-hirexa-blue/10">
                  <span className="text-xl text-hirexa-blue">🔒</span>
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
                <div className="bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
                  Preview (locked)
                </div>

                <div className="relative">
                  <div className="divide-y divide-gray-200">
                    {teaserJobs.map((j, idx) => (
                      <div key={idx} className="px-4 py-4">
                        <div className="font-semibold text-gray-900">{j.title}</div>
                        <div className="text-sm text-gray-500">
                          {j.company} · {j.location}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center bg-white/35 backdrop-blur-md">
                    <div className="w-[92%] max-w-sm rounded-2xl border border-gray-200 bg-white px-5 py-4 text-center shadow">
                      <div className="font-semibold text-gray-900">Verify to unlock</div>
                      <div className="mt-1 text-xs text-gray-500">
                        Enter the code we sent to{" "}
                        <span className="font-medium">{email}</span>
                      </div>

                      <div className="mt-3">
                        <OtpBoxes
                          value={otp}
                          onChange={setOtp}
                          disabled={loading}
                          onComplete={() => {
                            if (!loading) {
                              void verifyOtp();
                            }
                          }}
                        />

                        <button
                          type="button"
                          onClick={verifyOtp}
                          disabled={otp.length !== 6 || loading}
                          className={[
                            "mt-3 w-full rounded-xl py-3 font-semibold text-white transition",
                            otp.length !== 6 || loading
                              ? "cursor-not-allowed bg-gray-300"
                              : "bg-hirexa-blue hover:bg-hirexa-cyan",
                          ].join(" ")}
                        >
                          {loading ? "Verifying..." : "Unlock now"}
                        </button>

                        <button
                          type="button"
                          onClick={startSignup}
                          disabled={loading}
                          className="mt-2 w-full rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                        >
                          Resend code
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {msg && <div className="mt-4 text-sm text-gray-700">{msg}</div>}

              <button
                type="button"
                onClick={() => setStep("signup")}
                className="mt-3 w-full rounded-xl border border-gray-200 py-3 font-semibold text-black transition hover:bg-gray-50"
              >
                Back
              </button>
            </div>

            <div className="w-1/3 p-8 md:p-10">
              <h3 className="text-2xl font-semibold text-gray-900">Verify your email</h3>
              <p className="mt-1 text-gray-500">
                Enter the 6-digit code sent to <span className="font-medium">{email}</span>.
              </p>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Verification code</label>
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    placeholder="123456"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-lg tracking-[0.3em] text-black placeholder-black/50 focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30"
                  />
                </div>

                {msg && <div className="text-sm text-gray-700">{msg}</div>}

                <button
                  disabled={otp.length !== 6 || loading}
                  onClick={verifyOtp}
                  className={[
                    "w-full rounded-xl py-3 font-semibold text-white transition",
                    otp.length !== 6 || loading
                      ? "cursor-not-allowed bg-gray-300"
                      : "bg-hirexa-blue hover:bg-hirexa-cyan",
                  ].join(" ")}
                >
                  {loading ? "Verifying..." : "Unlock my jobs"}
                </button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => setStep("peek")}
                    className="text-black hover:text-black/80"
                  >
                    ← Back
                  </button>

                  <button
                    type="button"
                    onClick={startSignup}
                    className="text-hirexa-blue hover:underline"
                  >
                    Resend code
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="px-8 pb-6 pt-4 text-center text-xs text-gray-500">
            By continuing, you agree to Hirexa AI&apos;s Terms & Privacy.
          </div>

          <div className="absolute left-0 right-0 top-0 h-[3px] bg-gradient-to-r from-hirexa-blue via-hirexa-cyan to-hirexa-orange" />
        </div>
      </div>
    </div>
  );
}
