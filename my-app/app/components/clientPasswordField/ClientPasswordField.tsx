// components/client-password-field.tsx
"use client";

import { useState } from "react";
import ClientPasswordField1 from "@/components/clientPasswordField/ClientPasswordField";

export default function ClientPasswordField() {
  const [show, setShow] = useState(false);

  return (
    <div>
      <label
        htmlFor="password"
        className="block text-sm font-medium text-gray-800"
      >
        Password
      </label>

      <div className="relative mt-2">
        <input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 pr-11 text-sm text-gray-900 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
        />

        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-gray-500 hover:text-gray-700"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {/* eye icon */}
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
  );
}
