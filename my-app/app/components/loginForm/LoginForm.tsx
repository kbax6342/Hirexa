// components/login-form.tsx
"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "../../login/actions";

export default function LoginForm() {
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "").toLowerCase().trim();
    const password = String(form.get("password") || "");

    startTransition(async () => {
      try {
        await loginAction(email, password);
        // signIn() with redirectTo usually redirects automatically,
        // but keeping these is fine in dev:
        router.refresh();
        router.push("/dashboard");
      } catch (err) {
        //alert("Invalid email or password");
        console.log(err)
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
    {/* Email */}
    <div>
      <label
        htmlFor="email"
        className="block text-sm font-medium text-gray-700"
      >
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
      />
    </div>
  
    {/* Password */}
    <div>
      <label
        htmlFor="password"
        className="block text-sm font-medium text-gray-700"
      >
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
      />
    </div>
  
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Signing in..." : "Sign in"}
    </button>
  </form>
  
  );
}
