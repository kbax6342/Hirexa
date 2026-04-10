import type { ApplySessionDebug } from "@/app/lib/apply/applySessionStore";

type JsonRecord = Record<string, unknown>;

export type AutomationAuditState = {
  provider?: string | null;
  status?: string | null;
  finalUrl?: string | null;
  message?: string | null;
  finalReason?: string | null;
  formDetected?: boolean;
  confirmationDetected?: boolean;
  verificationDetected?: boolean;
  runId?: string | null;
  debug?: ApplySessionDebug | null;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

export function readAutomationAudit(rawAudit: unknown) {
  const audit = asRecord(rawAudit) ?? {};
  const automation =
    asRecord(audit.automation) ??
    asRecord(audit.openclaw) ??
    asRecord(audit.playwright) ??
    null;

  const debug =
    asRecord(automation?.debug) ?? asRecord(automation) ?? undefined;

  return {
    audit,
    automation,
    state: {
      provider: asString(automation?.provider) ?? asString(audit.provider),
      status: asString(automation?.status),
      finalUrl: asString(automation?.finalUrl),
      message: asString(automation?.message),
      finalReason: asString(automation?.finalReason),
      formDetected: asBoolean(automation?.formDetected),
      confirmationDetected: asBoolean(automation?.confirmationDetected),
      verificationDetected: asBoolean(automation?.verificationDetected),
      runId: asString(automation?.runId),
      debug: (debug as ApplySessionDebug | undefined) ?? null,
    } satisfies AutomationAuditState,
  };
}

export function buildAutomationAudit(args: {
  existingAudit?: unknown;
  provider?: string | null;
  finalValuesToSubmit?: Record<string, unknown> | null;
  missing?: string[] | null;
  automation: AutomationAuditState;
}) {
  const previousAudit = asRecord(args.existingAudit) ?? {};
  const previousAutomation =
    asRecord(previousAudit.automation) ??
    asRecord(previousAudit.openclaw) ??
    {};

  const nextAutomation = {
    ...previousAutomation,
    ...args.automation,
    provider: args.automation.provider ?? args.provider ?? "openclaw",
  };

  const nextAudit: JsonRecord = {
    ...previousAudit,
    provider: args.provider ?? asString(previousAudit.provider) ?? "openclaw",
    automation: nextAutomation,
    openclaw: nextAutomation,
  };

  if (args.finalValuesToSubmit) {
    nextAudit.finalValuesToSubmit = args.finalValuesToSubmit;
  }

  if (args.missing) {
    nextAudit.missing = args.missing;
  }

  return nextAudit;
}
