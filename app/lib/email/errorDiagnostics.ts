type EmailErrorSource = "provider_sdk" | "internal_http" | "unknown";

export type NormalizedEmailError = {
  source: EmailErrorSource;
  name: string | null;
  message: string;
  code: string | number | null;
  status: number | null;
  statusText: string | null;
  url: string | null;
  responseBody: unknown;
  responseHeaders: unknown;
  providerErrors: unknown;
  env: Record<string, boolean>;
};

export type EmailFailureKind =
  | "missing_api_key"
  | "invalid_api_key"
  | "permission_issue"
  | "sender_verification_issue"
  | "provider_request_failure"
  | "unknown";

export type EmailFailureClassification = {
  kind: EmailFailureKind;
  status: 500 | 502;
  providerMessage: string;
};

const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 4_000;
const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN =
  /(authorization|api[-_]?key|token|secret|password|passwd|cookie|set-cookie)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function truncate(value: string) {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`
    : value;
}

function redactSecretsInString(value: string) {
  return truncate(
    value
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
      .replace(/\bSG\.[A-Za-z0-9._-]+\b/g, REDACTED),
  );
}

function toSafeSerializable(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return "[MaxDepthExceeded]";
  }

  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return redactSecretsInString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSecretsInString(value.message),
    };
  }

  if (typeof Headers !== "undefined" && value instanceof Headers) {
    return Object.fromEntries(
      [...value.entries()].map(([key, nestedValue]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key)
          ? REDACTED
          : toSafeSerializable(nestedValue, depth + 1),
      ]),
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => toSafeSerializable(item, depth + 1));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key)
          ? REDACTED
          : toSafeSerializable(nestedValue, depth + 1),
      ]),
    );
  }

  return redactSecretsInString(String(value));
}

async function readResponseBody(response: Response) {
  try {
    const bodyText = await response.clone().text();
    if (!bodyText) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        return toSafeSerializable(JSON.parse(bodyText));
      } catch {
        return redactSecretsInString(bodyText);
      }
    }

    return redactSecretsInString(bodyText);
  } catch {
    return null;
  }
}

function getEnvPresence() {
  return {
    hasSendGridApiKey: Boolean(process.env.SENDGRID_API_KEY?.trim()),
    hasEmailFrom: Boolean(process.env.EMAIL_FROM?.trim()),
    hasSendGridFrom: Boolean(process.env.SENDGRID_FROM?.trim()),
    hasEmailFromAddress: Boolean(process.env.EMAIL_FROM_ADDRESS?.trim()),
    hasSendGridFromEmail: Boolean(process.env.SENDGRID_FROM_EMAIL?.trim()),
    hasEmailFromName: Boolean(process.env.EMAIL_FROM_NAME?.trim()),
    hasSendGridFromName: Boolean(process.env.SENDGRID_FROM_NAME?.trim()),
    hasEmailReplyTo: Boolean(process.env.EMAIL_REPLY_TO?.trim()),
    hasSendGridReplyTo: Boolean(process.env.SENDGRID_REPLY_TO?.trim()),
    hasEmailSupport: Boolean(process.env.EMAIL_SUPPORT?.trim()),
    hasEmailSecurityFromAddress: Boolean(
      process.env.EMAIL_SECURITY_FROM_ADDRESS?.trim(),
    ),
    hasEmailSecurityFromName: Boolean(
      process.env.EMAIL_SECURITY_FROM_NAME?.trim(),
    ),
    hasEmailSecurityReplyTo: Boolean(
      process.env.EMAIL_SECURITY_REPLY_TO?.trim(),
    ),
  };
}

function readNumericStatus(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? redactSecretsInString(value)
    : null;
}

function readCode(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

export async function normalizeEmailError(
  error: unknown,
): Promise<NormalizedEmailError> {
  const message =
    error instanceof Error
      ? redactSecretsInString(error.message)
      : typeof error === "string"
        ? redactSecretsInString(error)
        : "Unknown email error";
  const name = error instanceof Error ? error.name : null;
  const candidate = isRecord(error) ? error : null;

  let source: EmailErrorSource = "unknown";
  let status: number | null = null;
  let statusText: string | null = null;
  let url: string | null = null;
  let responseBody: unknown = null;
  let responseHeaders: unknown = null;
  let providerErrors: unknown = null;

  if (error instanceof Response) {
    source = "internal_http";
    status = error.status;
    statusText = readText(error.statusText);
    url = readText(error.url);
    responseBody = await readResponseBody(error);
    responseHeaders = toSafeSerializable(error.headers);
  } else if (candidate?.response instanceof Response) {
    source = "internal_http";
    status = candidate.response.status;
    statusText = readText(candidate.response.statusText);
    url = readText(candidate.response.url);
    responseBody = await readResponseBody(candidate.response);
    responseHeaders = toSafeSerializable(candidate.response.headers);
  } else if (
    candidate &&
    isRecord(candidate.response) &&
    (
      "statusCode" in candidate.response ||
      "body" in candidate.response ||
      "headers" in candidate.response
    )
  ) {
    source = "provider_sdk";
    status = readNumericStatus(candidate.response.statusCode);
    statusText = readText(candidate.response.statusText);
    responseBody = toSafeSerializable(candidate.response.body);
    responseHeaders = toSafeSerializable(candidate.response.headers);

    if (
      isRecord(candidate.response.body) &&
      Array.isArray(candidate.response.body.errors)
    ) {
      providerErrors = toSafeSerializable(candidate.response.body.errors);
    }
  } else if (
    candidate &&
    (typeof candidate.status === "number" || typeof candidate.statusText === "string")
  ) {
    source = "internal_http";
    status = readNumericStatus(candidate.status);
    statusText = readText(candidate.statusText);
    url = readText(candidate.url);
    responseBody = toSafeSerializable(
      candidate.body ?? candidate.responseBody ?? null,
    );
    responseHeaders = toSafeSerializable(candidate.headers ?? null);
  } else if (
    candidate &&
    isRecord(candidate.response) &&
    (typeof candidate.response.status === "number" ||
      typeof candidate.response.statusText === "string")
  ) {
    source = "internal_http";
    status = readNumericStatus(candidate.response.status);
    statusText = readText(candidate.response.statusText);
    url = readText(candidate.response.url);
    responseBody = toSafeSerializable(
      candidate.response.body ?? candidate.response.responseBody ?? null,
    );
    responseHeaders = toSafeSerializable(candidate.response.headers ?? null);
  }

  return {
    source,
    name,
    message,
    code: readCode(candidate?.code),
    status,
    statusText,
    url,
    responseBody,
    responseHeaders,
    providerErrors,
    env: getEnvPresence(),
  };
}

function safeContains(value: unknown, pattern: RegExp) {
  if (typeof value === "string") {
    return pattern.test(value);
  }

  try {
    return pattern.test(JSON.stringify(value));
  } catch {
    return false;
  }
}

export function classifyEmailFailure(
  diagnostic: NormalizedEmailError
): EmailFailureClassification {
  const status = diagnostic.status;
  const hasApiKey = diagnostic.env.hasSendGridApiKey;
  const authPattern =
    /\b(unauthorized|invalid api key|authentication failed|permission denied|access forbidden|forbidden)\b/i;
  const senderPattern =
    /\b(sender identity|verified sender|from address|from email|authenticated domain|domain authentication|single sender verification)\b/i;

  if (!hasApiKey || /missing sendgrid_api_key/i.test(diagnostic.message)) {
    return {
      kind: "missing_api_key",
      status: 500,
      providerMessage: "missing or empty SendGrid API key",
    };
  }

  if (
    status === 401 ||
    /unauthorized|invalid api key|authentication/i.test(diagnostic.message) ||
    safeContains(diagnostic.providerErrors, authPattern) ||
    safeContains(diagnostic.responseBody, authPattern)
  ) {
    return {
      kind: "invalid_api_key",
      status: 502,
      providerMessage: "email provider rejected authentication",
    };
  }

  if (
    status === 403 &&
    (safeContains(diagnostic.providerErrors, senderPattern) ||
      safeContains(diagnostic.responseBody, senderPattern) ||
      senderPattern.test(diagnostic.message))
  ) {
    return {
      kind: "sender_verification_issue",
      status: 502,
      providerMessage: "sender identity or sending domain is not verified",
    };
  }

  if (status === 403 || /forbidden|permission/i.test(diagnostic.message)) {
    return {
      kind: "permission_issue",
      status: 502,
      providerMessage: "email provider denied permission for this request",
    };
  }

  if (
    status !== null ||
    diagnostic.source !== "unknown" ||
    diagnostic.providerErrors !== null ||
    diagnostic.responseBody !== null
  ) {
    return {
      kind: "provider_request_failure",
      status: 502,
      providerMessage: "email provider request failed",
    };
  }

  return {
    kind: "unknown",
    status: 500,
    providerMessage: "unknown email delivery failure",
  };
}
