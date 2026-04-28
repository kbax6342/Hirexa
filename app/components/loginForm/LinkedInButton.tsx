"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import type { SVGProps } from "react";
import { cn } from "@/app/lib/utils";

type LinkedInButtonProps = {
  callbackUrl?: string;
  className?: string;
  disabled?: boolean;
  onBeforeSignIn?: () => void | Promise<void>;
};

export function LinkedInLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="#0A66C2"
        d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.61 0 4.28 2.38 4.28 5.47v6.27ZM5.32 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.1 20.45H3.54V9H7.1v11.45ZM22.23 0H1.76C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.76 24h20.47c.97 0 1.77-.77 1.77-1.73V1.73C24 .77 23.2 0 22.23 0Z"
      />
    </svg>
  );
}

export default function LinkedInButton({
  callbackUrl = "/resume",
  className,
  disabled = false,
  onBeforeSignIn,
}: LinkedInButtonProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <div className="w-full">
      <button
        type="button"
        aria-label="Continue with LinkedIn"
        disabled={disabled}
        onClick={async () => {
          setErrorMessage(null);

          try {
            if (process.env.NODE_ENV !== "production") {
              console.info("[AUTH_LINKEDIN] signIn started", { callbackUrl });
            }

            if (onBeforeSignIn) {
              await onBeforeSignIn();
            }

            await signIn("linkedin", { callbackUrl });
          } catch (error) {
            if (process.env.NODE_ENV !== "production") {
              console.error("[AUTH_LINKEDIN] signIn failed", {
                message: readableClientError(error),
              });
            }
            setErrorMessage(
              "LinkedIn sign-in could not be completed. Please try again or use email sign-in.",
            );
          }
        }}
        className={cn(
          "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
          disabled ? "cursor-not-allowed opacity-60" : "hover:bg-slate-50",
          className,
        )}
      >
        <LinkedInLogo className="h-[18px] w-[18px] shrink-0" />
        <span>Continue with LinkedIn</span>
      </button>
      {errorMessage ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function readableClientError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    "statusText" in error
  ) {
    const status = String((error as { status?: unknown }).status ?? "");
    const statusText = String((error as { statusText?: unknown }).statusText ?? "");
    return [status, statusText].filter(Boolean).join(" ") || "Request failed";
  }
  if (typeof error === "string") return error;
  return Object.prototype.toString.call(error);
}
