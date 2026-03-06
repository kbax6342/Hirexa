import { auth } from "@/app/lib/auth";
import { redirect } from "next/navigation";
import LinkedInOutreachClient from "./LinkedInOutreachClient";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function LinkedInOutreachPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) {
    const params = new URLSearchParams();
    Object.entries(searchParams ?? {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, v));
      } else if (value) {
        params.set(key, value);
      }
    });

    const qs = params.toString();
    const callbackUrl = `/job-tools/agents/linkedin-outreach${qs ? `?${qs}` : ""}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  return <LinkedInOutreachClient />;
}
