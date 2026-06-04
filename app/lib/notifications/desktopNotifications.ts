export type DesktopNotificationPermissionState =
  | NotificationPermission
  | "unsupported";

export type DesktopNotificationPayload = {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
};

const DEFAULT_HIREXA_NOTIFICATION_ICON = "/favicon.ico";

function withDefaultIcon(
  payload: DesktopNotificationPayload
): DesktopNotificationPayload {
  return {
    icon: DEFAULT_HIREXA_NOTIFICATION_ICON,
    ...payload,
  };
}

export function isDesktopNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getDesktopNotificationPermissionState(): DesktopNotificationPermissionState {
  if (!isDesktopNotificationSupported()) {
    return "unsupported";
  }

  return window.Notification.permission;
}

export async function requestDesktopNotificationPermission(): Promise<DesktopNotificationPermissionState> {
  if (!isDesktopNotificationSupported()) {
    return "unsupported";
  }

  return await window.Notification.requestPermission();
}

export function sendDesktopBrowserNotification(
  payload: DesktopNotificationPayload
): Notification | null {
  if (getDesktopNotificationPermissionState() !== "granted") {
    return null;
  }

  const notificationPayload = withDefaultIcon(payload);
  return new window.Notification(notificationPayload.title, {
    body: notificationPayload.body,
    icon: notificationPayload.icon,
    tag: notificationPayload.tag,
    requireInteraction: notificationPayload.requireInteraction,
  });
}

export function createDesktopNotificationTestPayload(): DesktopNotificationPayload {
  return {
    title: "Hirexa AI notifications are on",
    body: "You’ll be able to get updates about job matches, applications, and interviews.",
    tag: "hirexa-desktop-notification-test",
  };
}

// Future enhancement: these payload builders can be reused by a service worker
// when Hirexa adds Web Push subscriptions and server-triggered notifications.
export function createNewJobMatchDesktopNotification(args: {
  jobTitle: string;
  companyName?: string | null;
}): DesktopNotificationPayload {
  const companyName = args.companyName?.trim();
  return {
    title: "New job match",
    body: companyName
      ? `${args.jobTitle} at ${companyName} matches your Hirexa AI profile.`
      : `${args.jobTitle} matches your Hirexa AI profile.`,
    tag: "hirexa-job-match",
  };
}

export function createApplicationSubmittedDesktopNotification(args: {
  jobTitle: string;
  companyName?: string | null;
}): DesktopNotificationPayload {
  const companyName = args.companyName?.trim();
  return {
    title: "Application submitted",
    body: companyName
      ? `Your application for ${args.jobTitle} at ${companyName} was submitted.`
      : `Your application for ${args.jobTitle} was submitted.`,
    tag: "hirexa-application-submitted",
  };
}

export function createInterviewReminderDesktopNotification(args: {
  jobTitle?: string | null;
  scheduledTime: string;
}): DesktopNotificationPayload {
  const jobTitle = args.jobTitle?.trim();
  return {
    title: "Interview reminder",
    body: jobTitle
      ? `${jobTitle} interview reminder: ${args.scheduledTime}.`
      : `You have an interview reminder: ${args.scheduledTime}.`,
    tag: "hirexa-interview-reminder",
    requireInteraction: true,
  };
}

export function createApplicationStatusUpdateDesktopNotification(args: {
  jobTitle: string;
  status: string;
}): DesktopNotificationPayload {
  return {
    title: "Application status update",
    body: `${args.jobTitle} is now marked as ${args.status}.`,
    tag: "hirexa-application-status-update",
  };
}

export function notifyNewJobMatch(args: {
  jobTitle: string;
  companyName?: string | null;
}) {
  return sendDesktopBrowserNotification(
    createNewJobMatchDesktopNotification(args)
  );
}

export function notifyApplicationSubmitted(args: {
  jobTitle: string;
  companyName?: string | null;
}) {
  return sendDesktopBrowserNotification(
    createApplicationSubmittedDesktopNotification(args)
  );
}

export function notifyInterviewReminder(args: {
  jobTitle?: string | null;
  scheduledTime: string;
}) {
  return sendDesktopBrowserNotification(
    createInterviewReminderDesktopNotification(args)
  );
}

export function notifyApplicationStatusUpdate(args: {
  jobTitle: string;
  status: string;
}) {
  return sendDesktopBrowserNotification(
    createApplicationStatusUpdateDesktopNotification(args)
  );
}
