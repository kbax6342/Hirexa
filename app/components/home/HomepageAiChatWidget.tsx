"use client";

import { useState } from "react";

import StaffingAiChatDemo from "@/app/components/demo/StaffingAiChatDemo";
import type { AiChatCompanySettings } from "@/app/types/ai-chat-settings";

type HomepageAiChatWidgetProps = {
  companySettings: AiChatCompanySettings;
};

export default function HomepageAiChatWidget({
  companySettings,
}: HomepageAiChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <StaffingAiChatDemo
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      companySlug={companySettings.companySlug}
      companySettings={companySettings}
    />
  );
}
