import { auth } from "@/auth";
import { redirect } from "next/navigation";
import LinkedInOutreachClient from "./LinkedInOutreachClient";

export const dynamic = "force-dynamic";

export default async function LinkedInOutreachPage() {
  const session = await auth();
  const hasUser = Boolean(session?.user?.id || session?.user?.email);
  if (!hasUser) {
    redirect("/login");
  }

  return <LinkedInOutreachClient />;
}
