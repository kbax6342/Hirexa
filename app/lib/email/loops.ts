import "server-only";

import { getEmailConfig, getLoopsConfig } from "./config";

const LOOPS_API_BASE = "https://app.loops.so/api/v1";

type LoopsResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  id?: string | null;
  status?: number;
};

type SyncLoopsContactParams = {
  email: string;
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  source?: string | null;
  subscribed?: boolean | null;
  userGroup?: string | null;
};

type SendLoopsTransactionalEmailParams = {
  email: string;
  transactionalId: string;
  dataVariables?: Record<string, string | number | boolean>;
  addToAudience?: boolean;
  idempotencyKey?: string;
};

const warnedKeys = new Set<string>();

function normalizeText(value: string | undefined | null) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : null;
}

function warnOnce(key: string, message: string, meta?: Record<string, unknown>) {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  console.warn(message, meta ?? {});
}

async function parseLoopsResponse(response: Response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text || null;
  }
}

export async function syncLoopsContact(params: SyncLoopsContactParams): Promise<LoopsResult> {
  const { apiKey, audienceEnabled } = getLoopsConfig();

  if (!audienceEnabled || !apiKey) {
    warnOnce(
      "loops-audience-missing-config",
      "[email][loops] Skipping contact sync because LOOPS_API_KEY is not configured."
    );
    return { ok: false, skipped: true, reason: "missing-config" };
  }

  const email = normalizeText(params.email)?.toLowerCase();
  if (!email) {
    return { ok: false, skipped: true, reason: "missing-email" };
  }

  const payload: Record<string, unknown> = {
    email,
    source: normalizeText(params.source) ?? "hirexa",
    userGroup: normalizeText(params.userGroup) ?? "hirexa",
  };

  const userId = normalizeText(params.userId);
  if (userId) payload.userId = userId;

  const firstName = normalizeText(params.firstName);
  if (firstName) payload.firstName = firstName;

  const lastName = normalizeText(params.lastName);
  if (lastName) payload.lastName = lastName;

  if (typeof params.subscribed === "boolean") {
    payload.subscribed = params.subscribed;
  }

  try {
    const response = await fetch(`${LOOPS_API_BASE}/contacts/update`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await parseLoopsResponse(response);
      console.warn("[email][loops] Contact sync failed", {
        status: response.status,
        email,
        source: payload.source,
        details,
      });
      return { ok: false, status: response.status, reason: "api-error" };
    }

    const data = (await parseLoopsResponse(response)) as { id?: string } | null;
    return { ok: true, id: data?.id ?? null };
  } catch (error) {
    console.warn("[email][loops] Contact sync request failed", {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: "request-failed" };
  }
}

export async function sendLoopsTransactionalEmail(
  params: SendLoopsTransactionalEmailParams
): Promise<LoopsResult> {
  const { transactionalApiKey, apiKey, transactionalEnabled } = getLoopsConfig();

  if (!transactionalEnabled) {
    warnOnce(
      "loops-transactional-missing-config",
      "[email][loops] Skipping transactional send because LOOPS_TRANSACTIONAL_API_KEY is not configured."
    );
    return { ok: false, skipped: true, reason: "missing-config" };
  }

  const email = normalizeText(params.email)?.toLowerCase();
  const transactionalId = normalizeText(params.transactionalId);

  if (!email || !transactionalId) {
    return { ok: false, skipped: true, reason: "missing-required-fields" };
  }

  const sender = getEmailConfig();
  const dataVariables = {
    fromName: sender.fromName,
    fromEmail: sender.fromAddress,
    replyToAddress: sender.replyTo ?? sender.fromAddress,
    sendingDomain: sender.sendingDomain,
    ...(params.dataVariables ?? {}),
  };

  try {
    const response = await fetch(`${LOOPS_API_BASE}/transactional`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${transactionalApiKey ?? apiKey}`,
        "Content-Type": "application/json",
        ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        email,
        transactionalId,
        addToAudience: params.addToAudience ?? false,
        dataVariables,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await parseLoopsResponse(response);
      console.warn("[email][loops] Transactional send failed", {
        status: response.status,
        email,
        transactionalId,
        details,
      });
      return { ok: false, status: response.status, reason: "api-error" };
    }

    // Loops controls the actual sender on the published transactional email.
    // To use the app-level sender identity, map these variables in the Loops template:
    // fromName, fromEmail, replyToAddress, sendingDomain.
    return { ok: true };
  } catch (error) {
    console.warn("[email][loops] Transactional request failed", {
      email,
      transactionalId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: "request-failed" };
  }
}
