"use client";

import Link from "next/link";
import {
  ArrowPathIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";

type DemoQuickControlsProps = {
  companySlug: string;
  onReset: () => void;
  onClose: () => void;
};

export default function DemoQuickControls({
  companySlug,
  onReset,
  onClose,
}: DemoQuickControlsProps) {
  const settingsHref = `/dashboard/chatbots/${encodeURIComponent(
    companySlug
  )}/settings`;
  const botDashboardHref = `/dashboard/chatbots/${encodeURIComponent(
    companySlug
  )}/bot-dashboard`;

  return (
    <div className="space-y-2">
      <Button
        asChild
        variant="outline"
        className="w-full justify-start rounded-full border-slate-200 bg-white text-black hover:bg-slate-50 hover:text-black"
      >
        <Link href={settingsHref}>
          <Cog6ToothIcon className="h-4 w-4" />
          Edit company setup
        </Link>
      </Button>
      <Button
        asChild
        variant="outline"
        className="w-full justify-start rounded-full border-slate-200 bg-white text-black hover:bg-slate-50 hover:text-black"
      >
        <Link href={botDashboardHref}>
          <ClipboardDocumentListIcon className="h-4 w-4" />
          View candidate leads
        </Link>
      </Button>
      <Button
        id="hirexa-staffing-chat-settings-reset-button"
        type="button"
        variant="outline"
        onClick={onReset}
        className="w-full justify-start rounded-full border-slate-200 bg-white text-black hover:bg-slate-50 hover:text-black"
      >
        <ArrowPathIcon className="h-4 w-4" />
        Reset demo
      </Button>
      <Button
        id="hirexa-staffing-chat-settings-close-button"
        type="button"
        variant="outline"
        onClick={onClose}
        className="w-full justify-start rounded-full border-slate-200 bg-white text-black hover:bg-slate-50 hover:text-black"
      >
        <XMarkIcon className="h-4 w-4" />
        Close chat
      </Button>
    </div>
  );
}
