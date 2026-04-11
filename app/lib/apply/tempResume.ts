import { access, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { prisma } from "@/app/lib/prisma";

type TempResumeSource = "resume_file_blob" | "generated_profile_resume" | "none";
type TempResumeIssue =
  | "none"
  | "no_resume_on_profile"
  | "invalid_resume_non_pdf"
  | "resume_staging_failed";

export type TempResumeResult = {
  path: string | null;
  filename: string | null;
  source: TempResumeSource;
  debug: {
    profileId: string;
    source: TempResumeSource;
    resumeFileFound: boolean;
    resumeRecordFound: boolean;
    sourceResumeFile: {
      id: string;
      fileName: string;
      mimeType: string;
      mimeTypeNormalized: string;
      isPdfLike: boolean;
      sizeBytes: number;
      blobBytes: number;
      hasBlob: boolean;
      createdAt: string;
    } | null;
    sourceResumeRecord: {
      id: string;
      filename: string;
      mimeType: string;
      updatedAt: string;
      experienceCount: number;
    } | null;
    resolvedPath: string | null;
    fileExistsOnDisk: boolean;
    bytesWritten: number;
    generationSucceeded: boolean;
    generationReason: string;
    resumeIssue: TempResumeIssue;
    resumeIssueDetail: string | null;
  };
};

function normalizeMimeType(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function extensionFromMimeType(mimeType: string) {
  switch (normalizeMimeType(mimeType)) {
    case "application/pdf":
      return ".pdf";
    case "application/msword":
      return ".doc";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return ".docx";
    case "text/plain":
      return ".txt";
    default:
      return ".bin";
  }
}

function isPdfMimeType(value: string | null | undefined) {
  const normalized = normalizeMimeType(value);
  return normalized === "application/pdf" || normalized.includes("pdf");
}

function isPdfFileName(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .endsWith(".pdf");
}

function sanitizeFileStem(value: string, fallback: string) {
  const trimmed = value.trim();
  const stem = (trimmed ? path.parse(trimmed).name : fallback)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return stem || fallback;
}

function buildResumeText(args: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  experiences: Array<{
    title: string;
    company: string;
    location: string | null;
    dateRange: string | null;
    bullets: Array<{ text: string }>;
  }>;
}) {
  const lines: string[] = [];
  const fullName = [args.firstName, args.lastName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const location = [args.city, args.state]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const contactLine = [args.email, args.phone, location]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" | ");

  if (fullName) lines.push(fullName);
  if (contactLine) lines.push(contactLine);

  if (lines.length > 0) {
    lines.push("");
  }

  if (args.experiences.length > 0) {
    lines.push("Experience");
    lines.push("");
  }

  for (const experience of args.experiences) {
    const titleCompany = [experience.title, experience.company]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(" - ");
    const details = [experience.dateRange, experience.location]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(" | ");

    if (titleCompany) lines.push(titleCompany);
    if (details) lines.push(details);
    for (const bullet of experience.bullets) {
      const text = String(bullet.text ?? "").trim();
      if (text) lines.push(`- ${text}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

async function buildResumePdfBuffer(resumeText: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontSize = 10;
  const marginX = 40;
  const marginTop = 48;
  const marginBottom = 40;
  const lineHeight = 14;
  const pageWidth = 612;
  const pageHeight = 792;
  const maxCharsPerLine = 95;

  const addPage = () => pdf.addPage([pageWidth, pageHeight]);

  let page = addPage();
  let y = pageHeight - marginTop;

  const writeLine = (line: string) => {
    if (y <= marginBottom) {
      page = addPage();
      y = pageHeight - marginTop;
    }

    page.drawText(line, {
      x: marginX,
      y,
      size: fontSize,
      font,
    });
    y -= lineHeight;
  };

  const rawLines = resumeText.split("\n");
  for (const raw of rawLines) {
    const line = raw.trimEnd();
    if (!line) {
      writeLine("");
      continue;
    }

    if (line.length <= maxCharsPerLine) {
      writeLine(line);
      continue;
    }

    let remaining = line;
    while (remaining.length > 0) {
      writeLine(remaining.slice(0, maxCharsPerLine));
      remaining = remaining.slice(maxCharsPerLine);
    }
  }

  return Buffer.from(await pdf.save());
}

async function checkFileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function writeResumeToTemp(profileId: string): Promise<TempResumeResult> {
  const latestResumeFile = await prisma.resumeFile.findFirst({
    where: { profileId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      blob: true,
    },
  });

  const resumeProfile = await prisma.userProfile.findUnique({
    where: { id: profileId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      city: true,
      state: true,
      resume: {
        select: {
          id: true,
          filename: true,
          mimeType: true,
          updatedAt: true,
          experiences: {
            orderBy: { order: "asc" },
            select: {
              title: true,
              company: true,
              location: true,
              dateRange: true,
              bullets: {
                orderBy: { order: "asc" },
                select: { text: true },
              },
            },
          },
        },
      },
    },
  });

  const sourceResumeFile = latestResumeFile
    ? {
        id: latestResumeFile.id,
        fileName: latestResumeFile.fileName,
        mimeType: latestResumeFile.mimeType,
        mimeTypeNormalized: normalizeMimeType(latestResumeFile.mimeType),
        isPdfLike:
          isPdfMimeType(latestResumeFile.mimeType) ||
          isPdfFileName(latestResumeFile.fileName),
        sizeBytes: latestResumeFile.sizeBytes,
        blobBytes: latestResumeFile.blob.byteLength,
        hasBlob: latestResumeFile.blob.byteLength > 0,
        createdAt: latestResumeFile.createdAt.toISOString(),
      }
    : null;
  const sourceResumeRecord = resumeProfile?.resume
    ? {
        id: resumeProfile.resume.id,
        filename: resumeProfile.resume.filename,
        mimeType: resumeProfile.resume.mimeType,
        updatedAt: resumeProfile.resume.updatedAt.toISOString(),
        experienceCount: resumeProfile.resume.experiences.length,
      }
    : null;

  console.log("[AUTO_APPLY_RESUME] latest resume source lookup", {
    profileId,
    resumeFileFound: Boolean(sourceResumeFile),
    resumeRecordFound: Boolean(sourceResumeRecord),
    sourceResumeFile,
    sourceResumeRecord,
  });

  if (latestResumeFile && sourceResumeFile?.hasBlob) {
    if (!sourceResumeFile.isPdfLike) {
      console.warn("[AUTO_APPLY_RESUME] latest resume file is not PDF; skipping blob staging", {
        profileId,
        sourceResumeFile,
      });
    } else {
      const fileName = latestResumeFile.fileName || `resume-${profileId}`;
      const explicitExtension = path.extname(fileName).trim();
      const extension =
        explicitExtension || extensionFromMimeType(latestResumeFile.mimeType) || ".pdf";
      const stem = sanitizeFileStem(fileName, `resume-${profileId}`);
      const tempPath = path.resolve(
        os.tmpdir(),
        `${stem}-${Date.now()}${extension.startsWith(".") ? extension : `.${extension}`}`,
      );
      const bytes = Buffer.from(latestResumeFile.blob);
      await writeFile(tempPath, bytes);
      const exists = await checkFileExists(tempPath);

      console.log("[AUTO_APPLY_RESUME] staged resume file blob", {
        profileId,
        sourceResumeFile,
        resolvedPath: tempPath,
        fileExistsOnDisk: exists,
        bytesWritten: bytes.byteLength,
      });

      if (exists) {
        return {
          path: tempPath,
          filename: fileName,
          source: "resume_file_blob",
          debug: {
            profileId,
            source: "resume_file_blob",
            resumeFileFound: true,
            resumeRecordFound: Boolean(sourceResumeRecord),
            sourceResumeFile,
            sourceResumeRecord,
            resolvedPath: tempPath,
            fileExistsOnDisk: true,
            bytesWritten: bytes.byteLength,
            generationSucceeded: true,
            generationReason: "staged_from_resume_file_blob",
            resumeIssue: "none",
            resumeIssueDetail: null,
          },
        };
      }

      return {
        path: null,
        filename: null,
        source: "none",
        debug: {
          profileId,
          source: "none",
          resumeFileFound: true,
          resumeRecordFound: Boolean(sourceResumeRecord),
          sourceResumeFile,
          sourceResumeRecord,
          resolvedPath: tempPath,
          fileExistsOnDisk: false,
          bytesWritten: bytes.byteLength,
          generationSucceeded: false,
          generationReason: "resume_file_blob_written_but_not_found",
          resumeIssue: "resume_staging_failed",
          resumeIssueDetail: "resume_file_blob_written_but_file_not_found",
        },
      };
    }
  }

  if (resumeProfile?.resume) {
    const generatedText = buildResumeText({
      firstName: resumeProfile.firstName,
      lastName: resumeProfile.lastName,
      email: resumeProfile.email,
      phone: resumeProfile.phone,
      city: resumeProfile.city,
      state: resumeProfile.state,
      experiences: resumeProfile.resume.experiences,
    });

    if (generatedText) {
      const parsed = path.parse(resumeProfile.resume.filename || `resume-${profileId}`);
      const baseName = `${parsed.name || `resume-${profileId}`}.pdf`;
      const stem = sanitizeFileStem(baseName, `resume-${profileId}`);
      const tempPath = path.resolve(os.tmpdir(), `${stem}-${Date.now()}.pdf`);
      const bytes = await buildResumePdfBuffer(generatedText);
      await writeFile(tempPath, bytes);
      const exists = await checkFileExists(tempPath);

      console.log("[AUTO_APPLY_RESUME] generated temp resume from profile data", {
        profileId,
        sourceResumeRecord,
        resolvedPath: tempPath,
        fileExistsOnDisk: exists,
        bytesWritten: bytes.byteLength,
      });

      if (exists) {
        return {
          path: tempPath,
          filename: baseName,
          source: "generated_profile_resume",
          debug: {
            profileId,
            source: "generated_profile_resume",
            resumeFileFound: Boolean(sourceResumeFile),
            resumeRecordFound: true,
            sourceResumeFile,
            sourceResumeRecord,
            resolvedPath: tempPath,
            fileExistsOnDisk: true,
            bytesWritten: bytes.byteLength,
            generationSucceeded: true,
            generationReason: "generated_from_profile_resume_data",
            resumeIssue: "none",
            resumeIssueDetail: null,
          },
        };
      }

      return {
        path: null,
        filename: null,
        source: "none",
        debug: {
          profileId,
          source: "none",
          resumeFileFound: Boolean(sourceResumeFile),
          resumeRecordFound: true,
          sourceResumeFile,
          sourceResumeRecord,
          resolvedPath: tempPath,
          fileExistsOnDisk: false,
          bytesWritten: bytes.byteLength,
          generationSucceeded: false,
          generationReason: "generated_profile_resume_written_but_not_found",
          resumeIssue: "resume_staging_failed",
          resumeIssueDetail: "generated_profile_resume_written_but_file_not_found",
        },
      };
    }
  }

  const resumeIssue: TempResumeIssue =
    !sourceResumeFile && !sourceResumeRecord
      ? "no_resume_on_profile"
      : sourceResumeFile && !sourceResumeFile.isPdfLike && !sourceResumeRecord
        ? "invalid_resume_non_pdf"
        : "resume_staging_failed";

  const resumeIssueDetail =
    resumeIssue === "no_resume_on_profile"
      ? "no_resume_file_or_profile_resume_data"
      : resumeIssue === "invalid_resume_non_pdf"
        ? "resume_file_found_but_not_pdf"
        : "resume_source_found_but_temp_staging_unavailable";

  console.log("[AUTO_APPLY_RESUME] no usable resume source for temp staging", {
    profileId,
    sourceResumeFile,
    sourceResumeRecord,
    resumeIssue,
    resumeIssueDetail,
  });

  return {
    path: null,
    filename: null,
    source: "none",
    debug: {
      profileId,
      source: "none",
      resumeFileFound: Boolean(sourceResumeFile),
      resumeRecordFound: Boolean(sourceResumeRecord),
      sourceResumeFile,
      sourceResumeRecord,
      resolvedPath: null,
      fileExistsOnDisk: false,
      bytesWritten: 0,
      generationSucceeded: false,
      generationReason: resumeIssueDetail,
      resumeIssue,
      resumeIssueDetail,
    },
  };
}
