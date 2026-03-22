"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type SessionUserWithFlags = {
  isExistingUser?: boolean;
};

export default function GoogleRedirectPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }

    const sessionUser = session?.user as SessionUserWithFlags | undefined;
    router.replace(
      sessionUser?.isExistingUser === true ? "/dashboard" : "/questions"
    );
  }, [router, session, status]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
      <div>
        <div className="text-lg font-semibold text-slate-900">
          Finishing sign-in...
        </div>
        <div className="mt-2 text-sm text-slate-500">
          Redirecting you to the right place.
        </div>
      </div>
    </div>
  );
}
