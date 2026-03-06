import { auth } from "@/app/lib/auth";
import { redirect } from "next/navigation";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const session = await auth();
  if (!session) {
    const callbackUrl = encodeURIComponent("/profile");
    redirect(`/login?callbackUrl=${callbackUrl}`);
  }

  return <ProfileClient />;
}
