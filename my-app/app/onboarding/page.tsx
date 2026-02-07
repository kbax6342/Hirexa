"use client";
import Link from "next/link";

export default function OnboardingPage() {
    return (
      <div className="min-h-screen flex flex-col bg-white text-black ">
        {/* Header */}
        <header className="h-14 flex items-center px-6 border-b">
        <Link href="/" className="text-xl font-semibold tracking-tight">Hirexa</Link>
        </header>
  
        {/* Main */}
        <main className="flex-1 flex flex-col items-center px-6 py-16 ">
          <h1 className="text-3xl font-semibold mb-2">
            Let’s set you up for success!
          </h1>
          <p className="text-gray-600 mb-12">
            Automate your job search in 3 simple steps.
          </p>
  
          {/* Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-6xl w-full">
            {/* Step 1 */}
            <StepCard
              step={1}
              title="Upload your resume."
              subtitle="Help us understand your experience."
            >
              <div className="bg-white rounded-xl p-4 shadow">
                <p className="font-medium mb-3">Resume.pdf</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>✓ Personal Information</li>
                  <li>✓ Experience</li>
                  <li>✓ Skills</li>
                  <li>✓ Education</li>
                  <li className="text-gray-400">Summary…</li>
                </ul>
              </div>
            </StepCard>
  
            {/* Step 2 */}
            <StepCard
              step={2}
              title="Complete a quick profile."
              subtitle="Share your preferences and career goals."
            >
              <div className="bg-white rounded-xl p-4 shadow space-y-4">
                <div>
                  <p className="text-xs text-gray-500">Your desired salary?</p>
                  <p className="font-semibold">$85,000</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">
                    Where do you want to work?
                  </p>
                  <p className="font-semibold">Houston, TX</p>
                </div>
              </div>
            </StepCard>
  
            {/* Step 3 */}
            <StepCard
              step={3}
              title="We find jobs and fill out applications."
              subtitle="All you have to do is hit submit."
            >
              <div className="bg-white rounded-xl p-4 shadow space-y-3">
                <p className="font-medium">Resume.pdf</p>
                <p className="text-sm text-blue-600">15 job matches</p>
  
                <JobItem company="Airbnb" />
                <JobItem company="Google" />
              </div>
            </StepCard>
          </div>
        </main>
  
        {/* Footer CTA */}
        <footer className="h-20 border-t flex items-center justify-end px-8">
          <div className="text-right">
          <Link href="/onboarding/job-interest"className="bg-blue-600 text-white px-8 py-3 rounded-full font-medium hover:bg-blue-700 transition">  Next</Link>
           
            <p className="text-xs text-gray-400 mt-2">
              By clicking “Next”, you agree to our{" "}
              <span className="underline cursor-pointer">
                Terms of Use
              </span>{" "}
              and{" "}
              <span className="underline cursor-pointer">
                Privacy Policy
              </span>
              .
            </p>
          </div>
        </footer>
      </div>
    );
  }
  
  /* ---------------- Components ---------------- */
  
  function StepCard({
    step,
    title,
    subtitle,
    children,
  }: {
    step: number;
    title: string;
    subtitle: string;
    children: React.ReactNode;
  }) {
    return (
      <div className="flex flex-col items-start">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center font-medium">
            {step}
          </div>
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-sm text-gray-600">{subtitle}</p>
          </div>
        </div>
  
        <div className="w-full rounded-2xl p-6 bg-gradient-to-br from-pink-200 via-blue-200 to-cyan-200">
          {children}
        </div>
      </div>
    );
  }
  
  function JobItem({ company }: { company: string }) {
    return (
      <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
        <span className="font-medium">{company}</span>
        <span className="text-xs text-green-600 flex items-center gap-1">
          ✓ Applied
        </span>
      </div>
    );
  }
  