import { redirect } from "next/navigation";
import { auth } from "@/app/lib/auth";
import { getCurrentViewerProfile } from "@/app/lib/profile-server";
import ProfileClient, { type ProfileApiResponse } from "./ProfileClient";

export default async function ProfilePage() {
  const session = (await auth()) as
    | {
        user?: {
          id?: string;
          email?: string | null;
        } | null;
      }
    | null;

  if (!session) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/profile")}`);
  }

  const { responseData } = await getCurrentViewerProfile({
    session,
    useCache: false,
    syncStripe: false,
    mergeGuestIntoUser: false,
  });

  const initialProfile = responseData.profile
    ? (JSON.parse(JSON.stringify(responseData.profile)) as ProfileApiResponse["profile"])
    : null;

  return <ProfileClient initialProfile={initialProfile} />;
}
