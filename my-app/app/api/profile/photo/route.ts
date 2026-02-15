import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ error: "Please upload a valid image file." }, { status: 400 });
    }

    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image must be smaller than 3MB." }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await image.arrayBuffer());

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        profileImage: fileBuffer,
        profileImageMimeType: image.type,
        profileImageFilename: image.name || null,
      },
      update: {
        profileImage: fileBuffer,
        profileImageMimeType: image.type,
        profileImageFilename: image.name || null,
      },
      select: {
        id: true,
        profileImageMimeType: true,
        profileImage: true,
      },
    });

    const profileImageUrl =
      profile.profileImage && profile.profileImageMimeType
        ? `data:${profile.profileImageMimeType};base64,${Buffer.from(profile.profileImage).toString("base64")}`
        : null;

    return NextResponse.json({ ok: true, profileImageUrl });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
