import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// export async function GET(req: Request) {
//   try {
//     const url = new URL(req.url);
//     const resumeId = url.searchParams.get("resumeId");

//     if (!resumeId) {
//       return NextResponse.json({ error: "Missing resumeId" }, { status: 400 });
//     }

//     const session = await auth();
//     const userId = session?.user?.id ?? null;

//     const c = await cookies();
//     const guestId = c.get("guest_user_id")?.value ?? null;

//     if (!userId && !guestId) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const profile = await prisma.userProfile.findUnique({
//       where: userId ? { userId } : { guestId: guestId! },
//       select: { id: true },
//     });

//     if (!profile) {
//       return NextResponse.json({ error: "Profile not found" }, { status: 404 });
//     }

//     // Ensure resume belongs to this profile
//     const resume = await prisma.resume.findFirst({
//       where: {
//         id: resumeId,
//         userProfile: { id: profile.id },
//       },
//       select: { id: true },
//     });
    

//     if (!resume) {
//       return NextResponse.json({ error: "Resume not found for this user" }, { status: 404 });
//     }

//     const row = await prisma.resumeExperience.findUnique({
//       where: { resumeId: resume.id },
//       select: { experiences: true },
//     });

//     return NextResponse.json({ experiences: row?.experiences ?? [] }, { status: 200 });
//   } catch (e: any) {
//     console.error("GET /api/resume/experience error:", e);
//     return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
//   }
// }


export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const resumeId = url.searchParams.get("resumeId");

    if (!resumeId) {
      return NextResponse.json({ error: "Missing resumeId" }, { status: 400 });
    }

    const experiences = await prisma.experience.findMany({
      where: { resumeId },
      orderBy: { order: "asc" },
      include: {
        bullets: { orderBy: { order: "asc" }, select: { text: true } },
      },
    });

    // ✅ shape for your UI: bullets: string[]
    const shaped = experiences.map((e) => ({
      id: e.id,
      title: e.title,
      company: e.company,
      location: e.location ?? null,
      dateRange: e.dateRange ?? null,
      bullets: e.bullets.map((b) => b.text),
    }));

    return NextResponse.json({ experiences: shaped });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type UpdateExperienceBody = {
  experienceId?: string;
  bullets?: string[];
};

type CreateExperienceBody = {
  title?: string;
  company?: string;
  location?: string | null;
  dateRange?: string | null;
  bullets?: string[];
};

async function resolveActiveProfile() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const c = await cookies();
  const guestId = c.get("guest_user_id")?.value ?? null;

  if (!userId && !guestId) {
    return { profile: null, status: 401 as const, error: "Unauthorized" };
  }

  const profile = await prisma.userProfile.findUnique({
    where: userId ? { userId } : { guestId: guestId! },
    select: { id: true },
  });

  if (!profile) {
    return { profile: null, status: 404 as const, error: "Profile not found" };
  }

  return { profile, status: 200 as const, error: null };
}

export async function POST(req: Request) {
  try {
    const resolvedProfile = await resolveActiveProfile();
    if (!resolvedProfile.profile) {
      return NextResponse.json({ error: resolvedProfile.error }, { status: resolvedProfile.status });
    }

    const body = (await req.json()) as CreateExperienceBody;
    const title = String(body.title ?? "").trim();
    const company = String(body.company ?? "").trim();
    const location = String(body.location ?? "").trim();
    const dateRange = String(body.dateRange ?? "").trim();
    const bullets = Array.isArray(body.bullets)
      ? body.bullets.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];

    if (!title || !company) {
      return NextResponse.json(
        { error: "Title and company are required to add experience." },
        { status: 400 }
      );
    }

    const resume = await prisma.resume.findUnique({
      where: { userProfileId: resolvedProfile.profile.id },
      select: { id: true },
    });

    if (!resume) {
      return NextResponse.json(
        { error: "Please upload your resume before adding experience." },
        { status: 400 }
      );
    }

    const latestExperience = await prisma.experience.findFirst({
      where: { resumeId: resume.id },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const createdExperience = await prisma.$transaction(async (tx) => {
      const created = await tx.experience.create({
        data: {
          resumeId: resume.id,
          order: (latestExperience?.order ?? -1) + 1,
          title,
          company,
          location: location || null,
          dateRange: dateRange || null,
        },
      });

      if (bullets.length > 0) {
        await tx.bullet.createMany({
          data: bullets.map((text, index) => ({
            experienceId: created.id,
            order: index,
            text,
          })),
        });
      }

      return tx.experience.findUnique({
        where: { id: created.id },
        include: {
          bullets: { orderBy: { order: "asc" }, select: { id: true, text: true } },
        },
      });
    });

    return NextResponse.json({
      ok: true,
      experience: {
        id: createdExperience?.id,
        title: createdExperience?.title ?? title,
        company: createdExperience?.company ?? company,
        location: createdExperience?.location ?? null,
        dateRange: createdExperience?.dateRange ?? null,
        bullets:
          createdExperience?.bullets.map((bullet) => ({
            id: bullet.id,
            text: bullet.text,
          })) ?? [],
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as UpdateExperienceBody;
    const experienceId = String(body.experienceId ?? "").trim();
    const bullets = Array.isArray(body.bullets)
      ? body.bullets.map((item) => String(item ?? "").trim()).filter(Boolean)
      : null;

    if (!experienceId) {
      return NextResponse.json({ error: "Missing experienceId" }, { status: 400 });
    }

    if (!bullets) {
      return NextResponse.json({ error: "Bullets must be an array of strings" }, { status: 400 });
    }

    const resolvedProfile = await resolveActiveProfile();
    if (!resolvedProfile.profile) {
      return NextResponse.json({ error: resolvedProfile.error }, { status: resolvedProfile.status });
    }

    const experience = await prisma.experience.findFirst({
      where: {
        id: experienceId,
        resume: { userProfileId: resolvedProfile.profile.id },
      },
      select: { id: true },
    });

    if (!experience) {
      return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.bullet.deleteMany({ where: { experienceId } });

      if (bullets.length > 0) {
        await tx.bullet.createMany({
          data: bullets.map((text, index) => ({
            experienceId,
            order: index,
            text,
          })),
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

