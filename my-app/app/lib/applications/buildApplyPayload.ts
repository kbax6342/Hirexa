import type { GhParsedForm } from "@/app/lib/greenhouse/parseGreenhouseForm";
import type { AuditItem } from "@/app/lib/greenhouse/mapProfileToForm";

export type FieldState = {
  path: string;
  value: unknown;
  isMissing: boolean;
  rawValue?: unknown;
  submittedValue?: unknown;
};

export type ApplyPayloadMeta = {
  missing: string[];
  fieldStates: FieldState[];
};

export type ApplyPayload = {
  action: string;
  method: string;
  fields: Record<string, unknown>;
  fileFields: Array<{
    name: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
};

type BuildApplyPayloadParams = {
  answers: Record<string, string | null | undefined>;
  form: GhParsedForm;
  prefillValues: Record<string, string>;
  auditItems: AuditItem[];
  resume?: {
    fileName: string | null;
    mimeType: string;
    bytes: Uint8Array;
  } | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function pickResumeFieldName(fields: Array<{ name: string; label: string; type: string }>) {
  const fileFields = fields.filter((field) => field.type === "file");
  if (!fileFields.length) return "resume";

  const resumeField = fileFields.find((field) => {
    const text = `${field.name} ${field.label}`.toLowerCase();
    return text.includes("resume") || text.includes("cv");
  });

  return resumeField?.name ?? fileFields[0].name;
}

export function buildApplyPayload(params: BuildApplyPayloadParams): {
  payload: ApplyPayload;
  meta: ApplyPayloadMeta;
} {
  const { answers, form, prefillValues, auditItems, resume } = params;
  const payloadFields: Record<string, unknown> = {
    ...form.hidden,
    ...prefillValues,
  };
  const fieldStates: FieldState[] = [];

  Object.entries(form.hidden).forEach(([key, value]) => {
    fieldStates.push({
      path: `hidden.${key}`,
      value,
      rawValue: value,
      submittedValue: value,
      isMissing: value == null || normalizeText(value).length === 0,
    });
  });

  Object.entries(prefillValues).forEach(([key, value]) => {
    payloadFields[key] = value;
    fieldStates.push({
      path: `prefill.${key}`,
      value,
      rawValue: value,
      submittedValue: value,
      isMissing: value == null || normalizeText(value).length === 0,
    });
  });

  Object.entries(answers).forEach(([key, rawValue]) => {
    const submittedValue = normalizeText(rawValue);
    payloadFields[key] = submittedValue;
    fieldStates.push({
      path: `answers.${key}`,
      value: submittedValue,
      rawValue,
      submittedValue,
      isMissing: submittedValue.length === 0,
    });
  });

  const fileFields: ApplyPayload["fileFields"] = [];
  if (resume?.bytes?.length) {
    const resumeFieldName = pickResumeFieldName(form.fields);
    const resumeFileName = resume.fileName || "resume.pdf";
    payloadFields[resumeFieldName] = {
      fileName: resumeFileName,
      mimeType: resume.mimeType,
      sizeBytes: resume.bytes.length,
    };

    fileFields.push({
      name: resumeFieldName,
      fileName: resumeFileName,
      mimeType: resume.mimeType,
      sizeBytes: resume.bytes.length,
    });

    fieldStates.push({
      path: `files.${resumeFieldName}`,
      value: payloadFields[resumeFieldName],
      rawValue: {
        fileName: resume.fileName,
        mimeType: resume.mimeType,
        sizeBytes: resume.bytes.length,
      },
      submittedValue: payloadFields[resumeFieldName],
      isMissing: false,
    });
  } else {
    fieldStates.push({
      path: "files.resume",
      value: null,
      rawValue: resume,
      submittedValue: null,
      isMissing: true,
    });
  }

  const missing = auditItems
    .filter((item) => item.required)
    .filter((item) => normalizeText(answers[item.name]).length === 0)
    .map((item) => item.name);

  return {
    payload: {
      action: form.action,
      method: form.method || "POST",
      fields: payloadFields,
      fileFields,
    },
    meta: {
      missing,
      fieldStates,
    },
  };
}
