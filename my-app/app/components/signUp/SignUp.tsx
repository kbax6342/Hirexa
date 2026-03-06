// components/signup-form.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";


export default function SignupForm() {
  const [show, setShow] = useState(false);

  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
  
    const form = new FormData(e.currentTarget);
    const name = String(form.get("fullName") || "");
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");
  
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
  
    if (!res.ok) {
      const data = await res.json();
      alert(data.error);
      return;
    }
  
    const login = await authClient.signIn.emailPassword({
      email,
      password,
      redirect: false,
      callbackUrl: "/dashboard",
    });
    if (login.error) {
      router.push("/login");
      return;
    }
    
    router.refresh();
    router.push("/dashboard");
  }
  

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-[620px] space-y-7">
      {/* Full Name */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-900" htmlFor="fullName">
          Full Name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          className="
            h-14 w-full rounded-md border border-gray-300 bg-white px-4
            text-base text-gray-900 shadow-sm outline-none
            focus:border-blue-600 focus:ring-4 focus:ring-blue-100
          "
        />
      </div>

      {/* Email */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-900" htmlFor="email">
          Email Address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className="
            h-14 w-full rounded-md border border-gray-300 bg-white px-4
            text-base text-gray-900 shadow-sm outline-none
            focus:border-blue-600 focus:ring-4 focus:ring-blue-100
          "
        />
      </div>

      {/* Password */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-900" htmlFor="password">
          Password
        </label>

        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            className="
              h-14 w-full rounded-md border border-gray-300 bg-white px-4 pr-14
              text-base text-gray-900 shadow-sm outline-none
              focus:border-blue-600 focus:ring-4 focus:ring-blue-100
            "
          />

          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 right-0 inline-flex w-14 items-center justify-center text-gray-500 hover:text-gray-700"
            aria-label={show ? "Hide password" : "Show password"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Register button */}
      <button
        type="submit"
        className="
          mt-2 h-14 w-full rounded-full
          !bg-blue-700 text-lg font-semibold text-white shadow-sm
          hover:!bg-blue-800
          focus:outline-none focus:ring-4 focus:ring-blue-200
        "
      >
        Register
      </button>

      {/* Legal copy */}
      <p className="mx-auto max-w-[600px] text-center text-xs leading-5 text-gray-700">
        By clicking &quot;Register,&quot; you agree to our{" "}
        <Link href="/terms" className="text-blue-700 hover:text-blue-800">
          Terms of Use
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-blue-700 hover:text-blue-800">
          Privacy Policy
        </Link>
        , and by sharing your email with us, you agree to receive marketing emails. You can opt out of marketing emails by accessing your
        account if you complete the registration, or unsubscribe by clicking on the link provided in the email.
      </p>

      {/* Bottom link */}
      <p className="text-center text-sm text-gray-900">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-blue-700 hover:text-blue-800">
          Log in
        </Link>
      </p>
    </form>
  );
}
