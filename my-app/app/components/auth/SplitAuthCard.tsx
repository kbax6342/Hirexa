"use client";

import { useMemo, useState } from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";

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

export default function SplitAuthCard() {
  const { executeRecaptcha } = useGoogleReCaptcha();

  const [step, setStep] = useState<Step>("signup");

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const [otp, setOtp] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // teaser data (you can replace later with real counts from your backend)
  const [foundCount, setFoundCount] = useState<number>(127);
  const [teaserJobs] = useState(() => [
    { title: "Software Engineer", company: "Nimbus Labs", location: "Remote (US)" },
    { title: "Project Manager", company: "BluePeak", location: "Chicago, IL" },
    { title: "Data Analyst", company: "Orbit Systems", location: "Pontiac, MI" },
    { title: "Marketing Specialist", company: "Skyline Co.", location: "Charlotte, NC" },
    { title: "Customer Support", company: "Pulse AI", location: "Hybrid" },
  ]);

  const pwScore = useMemo(() => scorePassword(pw), [pw]);

  const canContinue = email.includes("@") && pwScore.passed >= 4 && pw === pw2;

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
        body: JSON.stringify({ email, password: pw, recaptchaToken }),
      });
  
      const data = await res.json().catch(() => ({}));
  
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to start signup");
      }
      const normalizedEmail = email.trim().toLowerCase();

      // 2) Save email to profile + send welcome email (only after init succeeds)
      const res1 = await fetch("/api/onboarding/confirm-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalizedEmail }),
      });
  
      const data1 = await res1.json().catch(() => ({}));
  
      if (!res1.ok) {
        // Not fatal for signup/OTP, but you should surface it
        // If you want it to be fatal, replace with: throw new Error(...)
        console.warn("confirm-email failed:", data1);
        throw new Error(data1?.error ?? "Failed to save email");

      }
  
      // 3) Move UI forward
      setStep("peek");
      setMsg("We sent a 6-digit verification code to your email.");
    } catch (e: any) {
      setMsg(e?.message ?? "Something went wrong");
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

      window.location.href = "/jobs";
    } catch (e: any) {
      setMsg(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-5xl rounded-3xl overflow-hidden shadow-glow border border-white/10 bg-white/5">
      <div className="grid md:grid-cols-2">
        {/* LEFT BRAND PANEL — background image full height */}
        <div
          className="relative hidden md:flex h-full bg-cover bg-center"
          style={{ backgroundImage: "url('/branding/loginPanel.png')" }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/55 to-black/75" />

          <div className="relative p-10 flex flex-col justify-between w-full">
            <div>
              <div className="text-white text-xl font-semibold">Hirexa AI</div>
              <p className="text-white/70 mt-2 max-w-sm">
                Create an account to unlock your personalized job matches.
              </p>
              <div className="mt-3 text-white/60 text-xs">
                Secure signup · Email verification · Bot protection
              </div>
            </div>

            <div className="text-white/60 text-xs">
              By continuing, you agree to Hirexa AI’s Terms & Privacy.
            </div>
          </div>
        </div>

        {/* RIGHT SLIDING PANEL */}
        <div className="relative bg-white">
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
              <div className="w-1/3 p-8 md:p-10">
                <h3 className="text-2xl font-semibold text-gray-900">Create account</h3>
                <p className="text-gray-500 mt-1">Enter a secure password and verify your email.</p>

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
                      <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
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
                        ? "bg-gray-300 cursor-not-allowed"
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
                      <div className="rounded-2xl bg-white shadow px-5 py-4 border border-gray-200 text-center">
                        <div className="text-gray-900 font-semibold">Verify to unlock</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Enter the code we sent to <span className="font-medium">{email}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {msg && <div className="mt-4 text-sm text-gray-700">{msg}</div>}

                <button
                  onClick={() => setStep("verify")}
                  className="mt-6 w-full rounded-xl py-3 font-semibold text-white bg-hirexa-blue hover:bg-hirexa-cyan transition"
                >
                  Verify email to unlock
                </button>

                <button
                  type="button"
                  onClick={() => setStep("signup")}
                  className="mt-3 w-full rounded-xl py-3 font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition"
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
                      className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 tracking-[0.3em] text-lg text-black placeholder-black/50 focus:outline-none focus:ring-2 focus:ring-hirexa-blue/30"
                    />
                  </div>

                  {msg && <div className="text-sm text-gray-700">{msg}</div>}

                  <button
                    disabled={otp.length !== 6 || loading}
                    onClick={verifyOtp}
                    className={[
                      "w-full rounded-xl py-3 font-semibold text-white transition",
                      otp.length !== 6 || loading
                        ? "bg-gray-300 cursor-not-allowed"
                        : "bg-hirexa-blue hover:bg-hirexa-cyan",
                    ].join(" ")}
                  >
                    {loading ? "Verifying..." : "Unlock my jobs"}
                  </button>

                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => setStep("peek")}
                      className="text-gray-500 hover:text-gray-900"
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
          </div>

          {/* Top gradient line */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-hirexa-blue via-hirexa-cyan to-hirexa-orange" />
        </div>
      </div>
    </div>
  );
}
