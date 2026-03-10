import { auth } from "@/auth";
import { redirect } from "next/navigation";
import LinkedInOutreachClient from "./LinkedInOutreachClient";

export default async function LinkedInOutreachPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    redirect("/login");
  }

  return <LinkedInOutreachClient />;
}
