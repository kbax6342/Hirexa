import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/app/lib/prisma";

export async function writeResumeToTemp(profileId: string): Promise<{ path: string; filename: string } | null> {
  const resume = await prisma.resumeFile.findFirst({
    where: {
      profileId,
      mimeType: "application/pdf",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!resume) {
    return null;
  }

  const filename = resume.fileName || `resume-${profileId}.pdf`;
  const tempPath = path.join(os.tmpdir(), `resume-${profileId}-${Date.now()}.pdf`);
  await writeFile(tempPath, Buffer.from(resume.blob));

  return { path: tempPath, filename };
}
