// app/signup/page.tsx
import Link from "next/link";
import SignupForm from "@/components/signUp/SignUp";
import LoginFooter from "@/components/loginFooter/LoginFooter";

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <header className="h-16 border-b border-gray-100">
        <div className="mx-auto flex h-full w-full max-w-6xl items-center px-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-gray-900">
              Hirexa
            </span>
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-6xl px-6">
        <div className="flex min-h-[calc(100vh-4rem-22rem)] items-start justify-center pt-20 pb-16">
          <div className="w-full max-w-[680px]">
            <h1 className="text-center text-3xl font-semibold text-gray-900">
              Sign Up Today to Automate Your Job Search!
            </h1>

            <div className="mt-10">
              <SignupForm />
            </div>
          </div>
        </div>
      </main>

      <LoginFooter />
    </div>
  );
}
