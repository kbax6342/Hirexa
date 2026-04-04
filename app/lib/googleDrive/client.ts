export const GOOGLE_DRIVE_DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";
export const GOOGLE_DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.readonly";

export type GoogleDriveConfig = {
  clientId: string;
  apiKey: string;
  projectNumber?: string | null;
};

export type GoogleDriveFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  capabilities?: {
    canDownload?: boolean;
  };
};

type SupportedWorkspaceExport = {
  exportMimeType: string;
  outputMimeType: string;
  extension: string;
};

const SUPPORTED_BLOB_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/rtf",
  "text/rtf",
  "text/html",
]);

const GOOGLE_WORKSPACE_EXPORTS: Record<string, SupportedWorkspaceExport> = {
  "application/vnd.google-apps.document": {
    exportMimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    outputMimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
  },
  "application/vnd.google-apps.presentation": {
    exportMimeType: "application/pdf",
    outputMimeType: "application/pdf",
    extension: "pdf",
  },
  "application/vnd.google-apps.drawing": {
    exportMimeType: "application/pdf",
    outputMimeType: "application/pdf",
    extension: "pdf",
  },
};

type GoogleApiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{
      reason?: string;
      message?: string;
    }>;
  };
};

export class GoogleDriveImportError extends Error {
  code: string;
  status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "GoogleDriveImportError";
    this.code = code;
    this.status = status;
  }
}

export function sanitizeGoogleConfigValue(value?: string | null) {
  if (!value) return undefined;
  const sanitized = value.trim().replace(/^['"]|['"]$/g, "");
  return sanitized || undefined;
}

export function isGoogleWorkspaceMimeType(mimeType?: string | null) {
  return typeof mimeType === "string" && mimeType.startsWith("application/vnd.google-apps.");
}

export function buildGooglePickerMimeTypes() {
  return [
    ...SUPPORTED_BLOB_MIME_TYPES,
    ...Object.keys(GOOGLE_WORKSPACE_EXPORTS),
  ].join(",");
}

export async function fetchGoogleDriveMetadata(fileId: string, accessToken: string) {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`
  );
  url.searchParams.set("fields", "id,name,mimeType,capabilities/canDownload");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw await createGoogleDriveError(
      response,
      "We couldn't read that Google Drive file."
    );
  }

  return (await response.json()) as GoogleDriveFileMetadata;
}

export async function downloadGoogleDriveFile(
  metadata: GoogleDriveFileMetadata,
  accessToken: string
) {
  if (!metadata.capabilities?.canDownload) {
    throw new GoogleDriveImportError(
      "cannot_download",
      "That Google Drive file can't be downloaded.",
      403
    );
  }

  if (isGoogleWorkspaceMimeType(metadata.mimeType)) {
    const exportConfig = GOOGLE_WORKSPACE_EXPORTS[metadata.mimeType];
    if (!exportConfig) {
      throw new GoogleDriveImportError(
        "unsupported_workspace_type",
        "That Google Workspace file type isn't supported for resume import.",
        400
      );
    }

    const exportUrl = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(metadata.id)}/export`
    );
    exportUrl.searchParams.set("mimeType", exportConfig.exportMimeType);
    exportUrl.searchParams.set("supportsAllDrives", "true");

    const response = await fetch(exportUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw await createGoogleDriveError(
        response,
        "We couldn't export that Google Workspace file."
      );
    }

    const blob = await response.blob();
    return new File(
      [blob],
      ensureFileExtension(metadata.name, exportConfig.extension),
      { type: exportConfig.outputMimeType }
    );
  }

  if (!SUPPORTED_BLOB_MIME_TYPES.has(metadata.mimeType)) {
    throw new GoogleDriveImportError(
      "unsupported_file_type",
      "That file type isn't supported for resume import.",
      400
    );
  }

  const downloadUrl = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(metadata.id)}`
  );
  downloadUrl.searchParams.set("alt", "media");
  downloadUrl.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(downloadUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw await createGoogleDriveError(
      response,
      "We couldn't download that Google Drive file."
    );
  }

  const blob = await response.blob();
  return new File([blob], metadata.name, {
    type: metadata.mimeType || blob.type || "application/octet-stream",
  });
}

async function createGoogleDriveError(
  response: Response,
  fallbackMessage: string
) {
  let reason = "";
  let message = fallbackMessage;

  try {
    const payload = (await response.json()) as GoogleApiErrorPayload;
    const primaryError = payload.error?.errors?.[0];
    reason = String(primaryError?.reason ?? "").trim();
    message =
      primaryError?.message?.trim() ||
      payload.error?.message?.trim() ||
      fallbackMessage;
  } catch {
    // Keep fallback message when Google doesn't return JSON.
  }

  if (response.status === 403 && reason === "insufficientFilePermissions") {
    return new GoogleDriveImportError(
      "insufficient_permissions",
      "You don't have permission to download that Google Drive file.",
      response.status
    );
  }

  if (response.status === 404) {
    return new GoogleDriveImportError(
      "file_not_found",
      "That Google Drive file couldn't be found.",
      response.status
    );
  }

  return new GoogleDriveImportError(
    "google_drive_request_failed",
    message || fallbackMessage,
    response.status
  );
}

function ensureFileExtension(name: string, extension: string) {
  const normalizedName = name.trim() || `resume.${extension}`;
  const lowerName = normalizedName.toLowerCase();
  const expectedSuffix = `.${extension.toLowerCase()}`;

  if (lowerName.endsWith(expectedSuffix)) {
    return normalizedName;
  }

  return `${normalizedName}${expectedSuffix}`;
}
