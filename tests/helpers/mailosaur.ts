// File: /Hirexa/my-app/tests/helpers/mailosaur.ts
const MAILOSAUR_API_BASE = "https://mailosaur.com/api";

type MailosaurCode = {
  value?: string | null;
};

type MailosaurMessage = {
  id?: string;
  subject?: string | null;
  html?: {
    body?: string | null;
    codes?: MailosaurCode[] | null;
  } | null;
  text?: {
    body?: string | null;
    codes?: MailosaurCode[] | null;
  } | null;
  metadata?: {
    headers?: Array<{ field?: string | null; value?: string | null }> | null;
  } | null;
};

type MailosaurSearchResponse = {
  items?: MailosaurMessage[];
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getAuthHeader() {
  const apiKey = requireEnv("MAILOSAUR_API_KEY");
  const basic = Buffer.from(`${apiKey}:`).toString("base64");
  return `Basic ${basic}`;
}

async function mailosaurFetch<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${MAILOSAUR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload: T | { message?: string } | null = null;

  try {
    payload = text ? (JSON.parse(text) as T | { message?: string }) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? payload.message
        : text;
    throw new Error(message || `Mailosaur request failed: ${response.status}`);
  }

  return payload as T;
}

function extractOtpFromMessage(message: MailosaurMessage) {
  const directCodes = [
    ...(message.html?.codes ?? []),
    ...(message.text?.codes ?? []),
  ]
    .map((code) => String(code?.value ?? "").trim())
    .filter(Boolean);

  const directMatch = directCodes.find((code) => /^\d{6}$/.test(code));
  if (directMatch) {
    return directMatch;
  }

  const haystacks = [
    message.subject,
    message.html?.body,
    message.text?.body,
    ...(message.metadata?.headers ?? []).flatMap((header) => [
      header.field,
      header.value,
    ]),
  ]
    .map((value) => String(value ?? ""))
    .filter(Boolean);

  for (const haystack of haystacks) {
    const match = haystack.match(/\b(\d{6})\b/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

async function getMessageById(messageId: string) {
  return mailosaurFetch<MailosaurMessage>(`/messages/${encodeURIComponent(messageId)}`);
}

async function awaitMessage(sentTo: string, timeoutMs: number) {
  const serverId = requireEnv("MAILOSAUR_SERVER_ID");

  try {
    return await mailosaurFetch<MailosaurMessage>(
      `/messages/await?server=${encodeURIComponent(serverId)}`,
      {
        method: "POST",
        body: JSON.stringify({
          sentTo,
          timeout: timeoutMs,
        }),
      }
    );
  } catch {
    return null;
  }
}

async function searchLatestMessage(sentTo: string) {
  const serverId = requireEnv("MAILOSAUR_SERVER_ID");

  try {
    const result = await mailosaurFetch<MailosaurSearchResponse>(
      `/messages/search?server=${encodeURIComponent(serverId)}`,
      {
        method: "POST",
        body: JSON.stringify({
          sentTo,
          page: 0,
          itemsPerPage: 1,
        }),
      }
    );

    const message = result.items?.[0];
    if (!message?.id) {
      return message ?? null;
    }

    return getMessageById(message.id);
  } catch {
    return null;
  }
}

export function buildFreshMailosaurEmail(tag = "hirexa-e2e") {
  const serverId = requireEnv("MAILOSAUR_SERVER_ID");
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${tag}-${Date.now()}-${randomSuffix}@${serverId}.mailosaur.net`;
}

export async function waitForOtpCode(sentTo: string, timeoutMs = 60_000) {
  const awaitedMessage = await awaitMessage(sentTo, timeoutMs);
  const awaitedCode = awaitedMessage ? extractOtpFromMessage(awaitedMessage) : null;
  if (awaitedCode) {
    return awaitedCode;
  }

  const startedAt = Date.now();
  let lastMessage: MailosaurMessage | null = awaitedMessage;

  while (Date.now() - startedAt < timeoutMs) {
    lastMessage = await searchLatestMessage(sentTo);
    const code = lastMessage ? extractOtpFromMessage(lastMessage) : null;
    if (code) {
      return code;
    }

    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  throw new Error(
    `Timed out waiting for OTP email for ${sentTo}. Last message id: ${lastMessage?.id ?? "none"}`
  );
}
