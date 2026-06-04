import { redirect } from "next/navigation";
import { auth } from "@/auth";

import AiChatSettingsClient from "@/app/dashboard/ai-chat-settings/AiChatSettingsClient";

export default async function AiChatSettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/dashboard/ai-chat-settings");
  }

  return <AiChatSettingsClient />;
}
