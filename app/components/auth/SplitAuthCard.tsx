"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

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
  // 3 steps → 300% rail
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
  value: string; // digits only, up to 6
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

    if (clean && index < 5) refs.current[index + 1]?.focus();

    if (next.length === 6 && !next.includes("") && onComplete) {
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
      return;
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

    if (only.length === 6 && onComplete) onComplete();
  }

  return (
    <div className="mt-3 flex justify-center gap-2" data-testid="otp-boxes">
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
          className={[
            "h-12 w-12 rounded-xl border border-gray-200 bg-white text-center text-lg font-semibold text-gray-900",
            "focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30",
            disabled ? "opacity-60" : "",
          ].join(" ")}
          aria-label={`Digit ${i + 1}`}
          data-testid={`otp-digit-${i}`}
        />
      ))}
    </div>
  );
}

export default function SplitAuthCard() {
  const { executeRecaptcha } = useGoogleReCaptcha();

  const [step, setStep] = useState<Step>("signup");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  const [otp, setOtp] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // teaser data (you can replace later with real counts from your backend)
  const [foundCount] = useState<number>(127);
  const [teaserJobs] = useState(() => [
    { title: "Software Engineer", company: "Nimbus Labs", location: "Remote (US)" },
    { title: "Project Manager", company: "BluePeak", location: "Chicago, IL" },
    { title: "Data Analyst", company: "Orbit Systems", location: "Pontiac, MI" },
    { title: "Marketing Specialist", company: "Skyline Co.", location: "Charlotte, NC" },
    { title: "Customer Support", company: "Pulse AI", location: "Hybrid" },
  ]);

  const pwScore = useMemo(() => scorePassword(pw), [pw]);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function loadProfileDefaults() {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        const data = await res.json().catch(() => null);

        if (!res.ok || cancelled) {
          return;
        }

        const profile = data?.profile as
          | {
              firstName?: string | null;
              lastName?: string | null;
              email?: string | null;
            }
          | undefined;

        if (!profile) return;

        setFirstName((prev) => prev || String(profile.firstName ?? "").trim());
        setLastName((prev) => prev || String(profile.lastName ?? "").trim());
        setEmail((prev) => prev || String(profile.email ?? "").trim());
      } catch {
        // Preserve existing behavior if the profile lookup fails.
      }
    }

    void loadProfileDefaults();

    return () => {
      cancelled = true;
    };
  }, []);

  const canContinue =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.includes("@") &&
    pwScore.passed >= 4 &&
    pw === pw2;

  async function startSignup() {
    setMsg(null);
    setLoading(true);
  
    try {
      if (!executeRecaptcha) {
        throw new Error("Security check not ready. Try again.");
      }
  
      const recaptchaToken = await executeRecaptcha("signup_init");
  
      // 1) Start signup (creates temp user / OTP flow, etc.)
      const res = await fetch("/api/auth/register/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password: pw,
          recaptchaToken,
        }),
      });
  
      const data = await res.json().catch(() => ({}));
  
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to start signup");
      }
      // 2) Move UI forward
      setStep("verify");
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
      if (!executeRecaptcha) throw new Error("Security check not ready. Try again.");

      const recaptchaToken = await executeRecaptcha("signup_verify");

      const res = await fetch("/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp, recaptchaToken }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Verification failed");

      const login = await signIn("credentials", {
        email,
        password: pw,
        redirect: false,
      });

      if (login?.error) {
        throw new Error("Email verified, but automatic sign-in failed. Please log in.");
      }

      router.push("/dashboard")
    } catch (e: unknown) {
      setMsg(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full mt-[50] max-w-lg overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)]">
      <div className="relative min-h-[670px] bg-white">
          <div className="overflow-hidden">
            <div
              className={[
                "flex w-[300%] transition-transform duration-500 ease-in-out",
                stepToTranslate(step),
              ].join(" ")}
            >
              {/* =======================
                  STEP 1: SIGNUP
                 ======================= */}
              <div className="w-1/3 px-8 py-10 md:px-10 md:py-12">
                <div className="mx-auto max-w-md">
                  <div className="text-center">
                    <h3 className="text-3xl font-semibold tracking-tight text-slate-900">
                      Create account
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Enter a secure password and verify your email.
                    </p>
                  </div>

                  <div className="mt-8 space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="signup-first-name"
                          className="text-sm font-medium text-slate-700"
                        >
                          First name
                        </label>
                        <input
                          id="signup-first-name"
                          name="firstName"
                          autoComplete="given-name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          type="text"
                          placeholder="First name"
                          className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="signup-last-name"
                          className="text-sm font-medium text-slate-700"
                        >
                          Last name
                        </label>
                        <input
                          id="signup-last-name"
                          name="lastName"
                          autoComplete="family-name"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          type="text"
                          placeholder="Last name"
                          className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="signup-email"
                        className="text-sm font-medium text-slate-700"
                      >
                        Email
                      </label>
                      <input
                        id="signup-email"
                        name="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        placeholder="Email address"
                        data-testid="signup-email"
                        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="signup-password"
                        className="text-sm font-medium text-slate-700"
                      >
                        Password
                      </label>
                      <div className="relative mt-2">
                        <input
                          id="signup-password"
                          name="password"
                          autoComplete="new-password"
                          value={pw}
                          onChange={(e) => setPw(e.target.value)}
                          type={showPw ? "text" : "password"}
                          placeholder="Password"
                          data-testid="signup-password"
                          className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-14 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw((prev) => !prev)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                          aria-label={showPw ? "Hide password" : "Show password"}
                        >
                          {showPw ? "Hide" : "Show"}
                        </button>
                      </div>

                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <div className="flex items-center justify-between text-xs font-medium">
                          <span className="text-slate-500">Password strength</span>
                          <span
                            className={[
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
                        <div className="mt-3 grid grid-cols-5 gap-2">
                          {Array.from({ length: 5 }, (_, index) => (
                            <div
                              key={index}
                              className={[
                                "h-2 rounded-full transition-colors",
                                index < pwScore.passed ? "bg-hirexa-blue" : "bg-slate-200",
                              ].join(" ")}
                            />
                          ))}
                        </div>
                        <p className="mt-3 text-xs leading-5 text-slate-500">
                          Use 8+ characters with uppercase, lowercase, a number, and a
                          symbol.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="signup-confirm-password"
                        className="text-sm font-medium text-slate-700"
                      >
                        Confirm password
                      </label>
                      <div className="relative mt-2">
                        <input
                          id="signup-confirm-password"
                          name="confirmPassword"
                          autoComplete="new-password"
                          value={pw2}
                          onChange={(e) => setPw2(e.target.value)}
                          type={showPw2 ? "text" : "password"}
                          placeholder="Confirm password"
                          data-testid="signup-confirm-password"
                          className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-14 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw2((prev) => !prev)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                          aria-label={showPw2 ? "Hide confirm password" : "Show confirm password"}
                        >
                          {showPw2 ? "Hide" : "Show"}
                        </button>
                      </div>
                      {pw2.length > 0 && pw !== pw2 && (
                        <div className="mt-2 text-xs font-medium text-red-600">
                          Passwords do not match.
                        </div>
                      )}
                    </div>

                    {msg && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        {msg}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={!canContinue || loading}
                      onClick={startSignup}
                      data-testid="signup-continue"
                      className={[
                        "w-full rounded-2xl px-4 py-3.5 text-sm font-semibold text-white transition focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30 focus:ring-offset-2",
                        !canContinue || loading
                          ? "cursor-not-allowed bg-slate-300"
                          : "bg-hirexa-blue hover:bg-hirexa-cyan",
                      ].join(" ")}
                    >
                      {loading ? "Sending code..." : "Continue"}
                    </button>

                    <p className="px-2 text-center text-xs leading-5 text-slate-500">
                      By continuing, you agree to Hirexa AI&apos;s{" "}
                      <Link
                        href="/terms"
                        className="font-medium text-slate-700 transition hover:text-hirexa-blue hover:underline"
                      >
                        Terms
                      </Link>{" "}
                      and{" "}
                      <Link
                        href="/privacy"
                        className="font-medium text-slate-700 transition hover:text-hirexa-blue hover:underline"
                      >
                        Privacy
                      </Link>
                      .
                    </p>

                    <div className="text-center text-sm text-slate-500">
                      Already have an account?{" "}
                      <Link
                        href="/login"
                        className="font-semibold text-hirexa-blue transition hover:underline"
                      >
                        Log in
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              {/* =======================
                  STEP 2: PEEK (LOCKED PREVIEW)
                 ======================= */}
              <div className="w-1/3 p-8 md:p-10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-semibold text-gray-900">Jobs found</h3>
                    <p className="text-gray-500 mt-1">
                      We found <span className="font-semibold text-gray-900">{foundCount}</span>{" "}
                      jobs near your locations.
                    </p>
                  </div>

                  <div className="h-11 w-11 rounded-2xl bg-hirexa-blue/10 flex items-center justify-center">
                    <span className="text-hirexa-blue text-xl">🔒</span>
                  </div>
                </div>

                {/* Blurred list preview */}
                <div className="mt-6 rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 text-sm font-medium text-gray-700">
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

                  {/* blur + lock overlay */}
                  <div className="absolute inset-0 backdrop-blur-md bg-white/35 flex items-center justify-center">
                    <div className="w-[92%] max-w-sm rounded-2xl bg-white shadow px-5 py-4 border border-gray-200 text-center">
                      <div className="text-gray-900 font-semibold">Verify to unlock</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Enter the code we sent to <span className="font-medium">{email}</span>
                      </div>

                      <div className="mt-3">
                        {/* <input
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && otp.length === 6 && !loading) {
                              verifyOtp(); // ✅ unlock from overlay
                            }
                          }}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder="123456"
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 tracking-[0.35em] text-lg text-black placeholder-black/40 focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30"
                        /> */}
                          <OtpBoxes
                            value={otp}
                            onChange={setOtp}
                            disabled={loading}
                            onComplete={() => {
                              // optional: auto-submit as soon as 6 digits entered
                              if (!loading) verifyOtp();
                            }}
                          />
                        <button
                          type="button"
                          onClick={verifyOtp}
                          disabled={otp.length !== 6 || loading}
                          data-testid="signup-peek-verify"
                          className={[
                            "mt-3 w-full rounded-xl py-3 font-semibold text-white transition",
                            otp.length !== 6 || loading
                              ? "bg-gray-300 cursor-not-allowed"
                              : "bg-sky-600 hover:bg-sky-700",
                          ].join(" ")}
                        >
                          {loading ? "Verifying..." : "Unlock now"}
                        </button>

                        <button
                          type="button"
                          onClick={startSignup}
                          disabled={loading}
                          data-testid="signup-resend-code"
                          className="mt-2 w-full rounded-xl py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition"
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
                  data-testid="signup-back"
                  className="mt-3 w-full rounded-xl py-3 font-semibold text-red-700 border border-red-200 bg-red-50 hover:bg-red-100 transition "
                >
                  Back
                </button>
              </div>

              {/* =======================
                  STEP 3: VERIFY OTP
                 ======================= */}
              <div className="w-1/3 p-8 md:p-10">
                <h3 className="text-2xl font-semibold text-gray-900">Verify your email</h3>
                <p className="text-gray-500 mt-1">
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
                      data-testid="otp-input"
                      className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 tracking-[0.3em] text-lg text-black placeholder-black/50 focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30"
                    />
                  </div>

                  {msg && <div className="text-sm text-gray-700">{msg}</div>}

                  <button
                    disabled={otp.length !== 6 || loading}
                    onClick={verifyOtp}
                    data-testid="otp-submit"
                    className={[
                      "w-full rounded-xl py-3 font-semibold text-white transition",
                      otp.length !== 6 || loading
                        ? "bg-gray-300 cursor-not-allowed"
                        : "bg-hirexa-blue hover:bg-hirexa-cyan",
                    ].join(" ")}
                  >
                    {loading ? "Verifying..." : "Verify and continue"}
                  </button>

                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => setStep("signup")}
                      data-testid="otp-back"
                      className="text-red-600 hover:text-red-700"
                    >
                      ← Back
                    </button>

                    <button
                      type="button"
                      onClick={startSignup}
                      data-testid="otp-resend"
                      className="text-hirexa-blue hover:underline"
                    >
                      Resend code
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top gradient line */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-hirexa-blue via-hirexa-cyan to-hirexa-orange" />
        </div>

      </div>
  );
}



