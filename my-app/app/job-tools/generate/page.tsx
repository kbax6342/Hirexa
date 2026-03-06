import { auth } from "@/app/lib/auth";
import { redirect } from "next/navigation";
import GenerateClient from "./GenerateClient";

export default async function GeneratePage() {
  const session = await auth();
  if (!session) {
    const callbackUrl = encodeURIComponent("/job-tools/generate");
    redirect(`/login?callbackUrl=${callbackUrl}`);
  }

  return <GenerateClient />;
}
