"use client";

import { signIn } from "next-auth/react";
import type { SVGProps } from "react";
import { cn } from "@/app/lib/utils";

const GOOGLE_CALLBACK_URL = "/auth/google/redirect";

type GoogleButtonProps = {
  callbackUrl?: string;
  className?: string;
  disabled?: boolean;
  onBeforeSignIn?: () => void | Promise<void>;
};

export function GoogleLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.638-.0573-1.2518-.1636-1.8409H9v3.4818h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7154v2.2582h2.9086c1.7023-1.5677 2.6837-3.8773 2.6837-6.6145z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.8055 5.9564-2.1809l-2.9086-2.2582c-.8055.54-1.8355.8591-3.0478.8591-2.3441 0-4.3282-1.5832-5.0364-3.7105H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.9636 10.7095C3.7832 10.1691 3.6818 9.5918 3.6818 9s.1014-1.1691.2818-1.7095V4.9582H.9573C.3477 6.1732 0 7.5491 0 9s.3477 2.8268.9573 4.0418l3.0063-2.3323z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.3445l2.5804-2.5805C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582l3.0063 2.3323C4.6718 5.1627 6.6559 3.5795 9 3.5795z"
      />
    </svg>
  );
}

export default function GoogleButton({
  callbackUrl = GOOGLE_CALLBACK_URL,
  className,
  disabled = false,
  onBeforeSignIn,
}: GoogleButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={async () => {
        if (onBeforeSignIn) {
          await onBeforeSignIn();
        }

        await signIn("google", { callbackUrl });
      }}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:bg-slate-50",
        className
      )}
    >
      <GoogleLogo className="h-[18px] w-[18px] shrink-0" />
      <span>Continue with Google</span>
    </button>
  );
}
