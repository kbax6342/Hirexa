"use client";

import { useMemo, useState } from "react";
import {
  BellAlertIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { useDesktopNotifications } from "@/app/hooks/useDesktopNotifications";
import { cn } from "@/app/lib/utils";
import { createDesktopNotificationTestPayload } from "@/app/lib/notifications/desktopNotifications";

export default function DesktopNotificationSettingsCard() {
  const {
    canNotify,
    permission,
    requestPermission,
    sendNotification,
  } = useDesktopNotifications();
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const statusConfig = useMemo(() => {
    if (permission === "granted") {
      return {
        icon: CheckCircleIcon,
        iconClassName: "text-emerald-600",
        panelClassName: "border-emerald-200 bg-emerald-50",
        title: "Notifications enabled",
        description: "Hirexa AI can show desktop notifications while this browser tab is open.",
      };
    }

    if (permission === "denied") {
      return {
        icon: ExclamationTriangleIcon,
        iconClassName: "text-amber-600",
        panelClassName: "border-amber-200 bg-amber-50",
        title: "Notifications blocked",
        description:
          "Desktop notifications are blocked in your browser. Update your site or browser settings to allow them for Hirexa AI.",
      };
    }

    if (permission === "unsupported") {
      return {
        icon: ExclamationTriangleIcon,
        iconClassName: "text-gray-500",
        panelClassName: "border-gray-200 bg-gray-50",
        title: "Notifications unsupported",
        description:
          "This browser does not support desktop notifications for Hirexa AI yet.",
      };
    }

    return {
      icon: BellAlertIcon,
      iconClassName: "text-blue-600",
      panelClassName: "border-blue-200 bg-blue-50",
      title: "Notifications not enabled",
      description:
        "Turn on desktop notifications to hear about Hirexa AI activity while you keep the app open.",
    };
  }, [permission]);

  async function handleEnableNotifications() {
    setFeedbackMessage(null);
    setIsRequestingPermission(true);

    try {
      const nextPermission = await requestPermission();

      if (nextPermission === "granted") {
        setFeedbackMessage(
          "Desktop notifications are enabled. You can send a test notification below."
        );
        return;
      }

      if (nextPermission === "denied") {
        setFeedbackMessage(
          "Notifications are blocked. Open your browser or site settings to allow notifications for Hirexa AI."
        );
        return;
      }

      if (nextPermission === "unsupported") {
        setFeedbackMessage(
          "This browser does not support desktop notifications."
        );
        return;
      }

      setFeedbackMessage(
        "The permission prompt was dismissed. You can try again whenever you're ready."
      );
    } finally {
      setIsRequestingPermission(false);
    }
  }

  function handleSendTestNotification() {
    setFeedbackMessage(null);
    setIsSendingTest(true);

    try {
      const notification = sendNotification(
        createDesktopNotificationTestPayload()
      );

      if (notification) {
        setFeedbackMessage("Test notification sent.");
        return;
      }

      if (permission === "denied") {
        setFeedbackMessage(
          "Notifications are currently blocked. Update your browser or site settings to allow them for Hirexa AI."
        );
        return;
      }

      if (permission === "unsupported") {
        setFeedbackMessage(
          "This browser does not support desktop notifications."
        );
        return;
      }

      setFeedbackMessage(
        "Enable notifications first so Hirexa AI can send desktop updates."
      );
    } finally {
      setIsSendingTest(false);
    }
  }

  const StatusIcon = statusConfig.icon;

  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <BellAlertIcon className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl text-gray-900">
              Desktop Notifications
            </CardTitle>
            <CardDescription className="max-w-2xl leading-6 text-gray-600">
              Get notified about job matches, application updates, and interview
              reminders while Hirexa AI is open.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div
          className={cn(
            "rounded-xl border p-4",
            statusConfig.panelClassName
          )}
        >
          <div className="flex items-start gap-3">
            <StatusIcon
              className={cn("mt-0.5 h-5 w-5 shrink-0", statusConfig.iconClassName)}
            />
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {statusConfig.title}
              </div>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                {statusConfig.description}
              </p>
            </div>
          </div>
        </div>

        {feedbackMessage ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700">
            {feedbackMessage}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {permission === "granted" ? (
            <Button
              type="button"
              onClick={handleSendTestNotification}
              disabled={isSendingTest || !canNotify}
            >
              {isSendingTest ? "Sending..." : "Send test notification"}
            </Button>
          ) : permission === "denied" ? (
            <Button type="button" disabled>
              Notifications blocked
            </Button>
          ) : permission === "unsupported" ? (
            <Button type="button" disabled>
              Notifications unsupported
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void handleEnableNotifications()}
              disabled={isRequestingPermission}
            >
              {isRequestingPermission
                ? "Checking..."
                : "Enable notifications"}
            </Button>
          )}
        </div>

        <p className="text-xs leading-5 text-gray-500">
          Notifications only appear while Hirexa AI is open in this browser.
          Browser-based Web Push can be added later without changing this
          settings flow.
        </p>
      </CardContent>
    </Card>
  );
}
