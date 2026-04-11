// /app/api/onboarding/resume/route.ts

import crypto from "crypto";

import { NextResponse } from "next/server";

import { auth } from "@/app/lib/auth";
import { sendResumeUploadedEmailIfNeeded } from "@/app/lib/email/lifecycle";
import { mergeGuestProfileIntoUserProfile } from "@/app/lib/profile/mergeGuestProfile";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";
import { prisma } from "@/app/lib/prisma";
import { persistResumeToProfile } from "@/app/lib/resume/persistResumeToProfile";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RetryableError = {
  status?: number;
  requestID?: string;
};

function isRetryableStatus(status?: number) {
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function extractStatusAndRequestId(error: unknown): RetryableError {
  const anyError = error as {
    status?: number;
    request_id?: string;
    requestID?: string;
    response?: { status?: number; headers?: { get?: (name: string) => string | null } };
  };

  return {
    status: anyError?.status ?? anyError?.response?.status,
    requestID:
      anyError?.request_id ??
      anyError?.requestID ??
      anyError?.response?.headers?.get?.("x-request-id") ??
      anyError?.response?.headers?.get?.("request-id") ??
      undefined,
  };
}

function normalizeResumeText(value: string) {
  return value.replace(/\r/g, "").trim();
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
    const cookieStore = await cookies();
    let guestId = cookieStore.get("guest_user_id")?.value ?? null;
    const shouldSetGuestCookie = !guestId;
    const originalGuestId = guestId;

    if (userId && guestId) {
      const existingGuestId = guestId;
      await prisma.$transaction((tx) =>
        mergeGuestProfileIntoUserProfile(tx, {
          userId,
          guestId: existingGuestId,
          email: session?.user?.email ?? null,
        })
      );
      guestId = null;
    }

    if (!userId && !guestId) {
      guestId = `guest_${crypto.randomUUID()}`;
    }

    const profile = await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId! },
      create: userId ? { userId } : { guestId: guestId! },
      update: {},
      select: { id: true, guestId: true },
    });

    console.log("[AUTO_APPLY_RESUME_UPLOAD] request", {
      sessionUserId: userId,
      sessionEmail: session?.user?.email ?? null,
      guestId,
      originalGuestId,
      profileId: profile.id,
      profileGuestId: profile.guestId,
    });

    const formData = await req.formData();
    const file = formData.get("resume");
    const rawResumeText = formData.get("resumeText");
    const pastedResumeText =
      typeof rawResumeText === "string" ? normalizeResumeText(rawResumeText) : "";

    if (!(file instanceof File) && !pastedResumeText) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing resume input. Upload a file or paste your resume text.",
        },
        { status: 400 }
      );
    }

    const resumeFile =
      file instanceof File
        ? {
            buffer: Buffer.from(await file.arrayBuffer()),
            fileName: file.name,
            mimeType: file.type || "application/pdf",
            sizeBytes: file.size,
          }
        : null;

    const persisted = await persistResumeToProfile({
      profileId: profile.id,
      resumeFile,
      resumeText: pastedResumeText || null,
    });

    const resumeLinkage = await prisma.userProfile.findUnique({
      where: { id: profile.id },
      select: {
        id: true,
        userId: true,
        email: true,
        resume: {
          select: {
            id: true,
            filename: true,
            mimeType: true,
            updatedAt: true,
            experiences: { select: { id: true } },
          },
        },
        resumeFiles: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
    });

    console.log("[AUTO_APPLY_RESUME_UPLOAD] persisted linkage", {
      sessionUserId: userId,
      sessionEmail: session?.user?.email ?? null,
      profileId: profile.id,
      profileUserId: resumeLinkage?.userId ?? null,
      profileEmail: resumeLinkage?.email ?? null,
      resumeRecordFound: Boolean(resumeLinkage?.resume),
      resumeFilesRecordExists: (resumeLinkage?.resumeFiles.length ?? 0) > 0,
      storedResumeMetadata: resumeLinkage?.resume
        ? {
            id: resumeLinkage.resume.id,
            filename: resumeLinkage.resume.filename,
            mimeType: resumeLinkage.resume.mimeType,
            updatedAt: resumeLinkage.resume.updatedAt.toISOString(),
            experienceCount: resumeLinkage.resume.experiences.length,
          }
        : null,
      latestResumeFileMetadata: resumeLinkage?.resumeFiles[0]
        ? {
            id: resumeLinkage.resumeFiles[0].id,
            fileName: resumeLinkage.resumeFiles[0].fileName,
            mimeType: resumeLinkage.resumeFiles[0].mimeType,
            sizeBytes: resumeLinkage.resumeFiles[0].sizeBytes,
            createdAt: resumeLinkage.resumeFiles[0].createdAt.toISOString(),
          }
        : null,
      persistedResume: persisted.resume,
      persistedResumeFile: persisted.savedResume,
    });

    invalidateCachedProfile({ userId, guestId: originalGuestId ?? guestId });
    await sendResumeUploadedEmailIfNeeded({
      profileId: profile.id,
      resumeId: persisted.resume.id,
      filename: persisted.resume.filename,
      mimeType: persisted.resume.mimeType,
      experienceTitles: persisted.parsedExperiences.map((experience) => experience.title),
    }).catch((emailError) => {
      console.warn("[resume upload] success email failed", {
        profileId: profile.id,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    });

    const response = NextResponse.json({
      ok: true,
      success: true,
      savedTo: { sessionUserId: userId, guestId: profile.guestId, profileId: profile.id },
      resume: {
        id: persisted.resume.id,
        profileId: persisted.resume.userProfileId,
        userProfileId: persisted.resume.userProfileId,
        fileName: persisted.resume.fileName,
        filename: persisted.resume.filename,
        mimeType: persisted.resume.mimeType,
      },
      parsed: { experienceCount: persisted.parsedExperiences.length },
      profileSync: persisted.profileSync,
      savedResume: persisted.savedResume,
    });

    if (userId && originalGuestId) {
      response.cookies.set("guest_user_id", "", {
        path: "/",
        maxAge: 0,
      });
    } else if (shouldSetGuestCookie && guestId) {
      response.cookies.set("guest_user_id", guestId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    response.cookies.set("onboarding_resume_skipped", "", {
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    const info = extractStatusAndRequestId(error);

    if (isRetryableStatus(info.status)) {
      return NextResponse.json(
        {
          error: "The resume parser is temporarily busy. Please try again in a few seconds.",
          provider: "openai",
          requestId: info.requestID ?? null,
        },
        { status: 503 }
      );
    }

    console.error("POST /api/onboarding/resume error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Server error",
      },
      { status: 500 }
    );
  }
}
