import "server-only";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { put } from "@vercel/blob";

export type StoredResumeFile = {
  fileUrl: string | null;
  storageKey: string;
  provider: "vercel-blob" | "local";
};

const LOCAL_RESUME_STORAGE_ROOT = path.join(process.cwd(), ".local-storage", "recruiter-resumes");

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function buildStorageKey(args: { jobRequisitionId: string; fileName: string }) {
  const datePrefix = new Date().toISOString().slice(0, 10);
  return path.posix.join(
    "job-requisitions",
    args.jobRequisitionId,
    datePrefix,
    `${randomUUID()}-${sanitizeFileName(args.fileName)}`
  );
}

async function storeLocally(args: { buffer: Buffer; storageKey: string }) {
  const absolutePath = path.join(LOCAL_RESUME_STORAGE_ROOT, args.storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, args.buffer);

  return {
    fileUrl: null,
    storageKey: absolutePath,
    provider: "local" as const,
  };
}

async function storeInVercelBlob(args: {
  buffer: Buffer;
  storageKey: string;
  mimeType: string;
}) {
  const blob = await put(args.storageKey, args.buffer, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: args.mimeType,
  });

  return {
    fileUrl: blob.url,
    storageKey: blob.pathname,
    provider: "vercel-blob" as const,
  };
}

export async function storeResumeFile(args: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  jobRequisitionId: string;
}): Promise<StoredResumeFile> {
  const storageKey = buildStorageKey({
    jobRequisitionId: args.jobRequisitionId,
    fileName: args.fileName,
  });

  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return storeInVercelBlob({
      buffer: args.buffer,
      storageKey,
      mimeType: args.mimeType,
    });
  }

  return storeLocally({
    buffer: args.buffer,
    storageKey,
  });
}
