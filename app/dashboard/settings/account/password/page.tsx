import { redirect } from "next/navigation";

export default function DashboardPasswordSettingsRedirect() {
  redirect("/settings/account/password");
}
