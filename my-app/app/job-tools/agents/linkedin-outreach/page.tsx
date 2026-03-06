import { auth } from "@/auth";
import { redirect } from "next/navigation";
import LinkedInOutreachClient from "./LinkedInOutreachClient";

export default async function LinkedInOutreachPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return <LinkedInOutreachClient />;
}
