import { requirePaidAccess } from "@/app/lib/access";
import ProfileClientPage from "./ProfileClientPage";

export default async function ProfilePage() {
  await requirePaidAccess("/profile");
  return <ProfileClientPage />;
}
