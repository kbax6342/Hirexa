// /Hirexa/my-app/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";
import { cookies } from "next/headers";

type ProfileBody = {
  firstName?: string;
  lastName?: string;
  dob?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  linkedinUrl?: string;
  phone?: string;
  email?: string;
};

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function parseDob(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized = raw.includes("/")
    ? (() => {
        const [mm, dd, yyyy] = raw.split("/");
        if (!mm || !dd || !yyyy) return null;
        return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      })()
    : raw;

  if (!normalized) return null;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ProfileBody;

    const firstName = normalizeText(body.firstName);
    const lastName = normalizeText(body.lastName);

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "Please fill in First name and Last name." },
        { status: 400 }
      );
    }

    const session = await auth();
    const userId = session?.user?.id ?? null;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        firstName,
        lastName,
        email: normalizeText(body.email) ?? session?.user?.email ?? null,
        phone: normalizeText(body.phone),
        dob: parseDob(body.dob),
        address: normalizeText(body.address),
        city: normalizeText(body.city),
        postalCode: normalizeText(body.postalCode),
        state: normalizeText(body.state),
        linkedinUrl: normalizeText(body.linkedinUrl),
      },
      update: {
        firstName,
        lastName,
        email: normalizeText(body.email) ?? session?.user?.email ?? undefined,
        phone: normalizeText(body.phone),
        dob: parseDob(body.dob),
        address: normalizeText(body.address),
        city: normalizeText(body.city),
        postalCode: normalizeText(body.postalCode),
        state: normalizeText(body.state),
        linkedinUrl: normalizeText(body.linkedinUrl),
      },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        dob: true,
        address: true,
        city: true,
        postalCode: true,
        state: true,
        linkedinUrl: true,
      },
    });

    return NextResponse.json({ ok: true, profile });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;

    if (!userId && !guestId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.userProfile.findFirst({
      where: userId ? { userId } : { guestId },
      select: {
        id: true,
        userId: true,
        guestId: true,
        skills: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        registrationStatus: true,
        welcomeEmailSentAt: true,
        keyQuestions: true,
        workplaceLocations: true,
        includeRemote: true,
        newsletterOptIn: true,
        newsletterSource: true,
        trialSubscriber: true,
        monthlySubscriber: true,
        yearlySubscriber: true,
        trialPlanStatus: true,
        monthlyPlanStatus: true,
        yearlyPlanStatus: true,
        lastPaymentReceivedAt: true,
        emailVerifiedAt: true,
        unsubscribedAt: true,
        resumeSkills: true,
        minCompensation: true,
        compensationType: true,
        profileImage: true,
        profileImageMimeType: true,
        profileImageFilename: true,
        dob: true,
        address: true,
        city: true,
        postalCode: true,
        state: true,
        linkedinUrl: true,
        authorizedUS: true,
        sponsorship: true,
        felony: true,
        startDate: true,
        screening: true,
        relocate: true,
        gender: true,
        pronouns: true,
        ethnicity: true,
        disability: true,
        veteran: true,
        createdAt: true,
        updatedAt: true,
        jobInterests: {
          select: {
            id: true,
            uuid: true,
            title: true,
          },
        },
        benefitSelections: {
          select: {
            id: true,
            selectedPlan: true,
            benefits: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        jobApplications: {
          select: {
            id: true,
            jobTitle: true,
            company: true,
            location: true,
            jobUrl: true,
            sourceJobId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        stripePayments: {
          select: {
            id: true,
            stripeEventId: true,
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            stripeCheckoutSessionId: true,
            stripeInvoiceId: true,
            stripePaymentIntentId: true,
            planType: true,
            status: true,
            amount: true,
            currency: true,
            paidAt: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        resumeFiles: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
        resume: {
          select: {
            id: true,
            filename: true,
            mimeType: true,
            updatedAt: true,
            experiences: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                title: true,
                company: true,
                location: true,
                dateRange: true,
                bullets: {
                  orderBy: { order: "asc" },
                  select: {
                    id: true,
                    text: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const responseProfile = profile
      ? {
          ...profile,
          expertise:
            profile.keyQuestions &&
            typeof profile.keyQuestions === "object" &&
            !Array.isArray(profile.keyQuestions)
              ? Array.isArray((profile.keyQuestions as Record<string, unknown>).expertise)
                ? (profile.keyQuestions as Record<string, unknown>).expertise
                    .map((item) => String(item))
                : []
              : [],
          profileImageUrl:
            profile.profileImage && profile.profileImageMimeType
              ? `data:${profile.profileImageMimeType};base64,${Buffer.from(profile.profileImage).toString("base64")}`
              : null,
        }
      : null;

    return NextResponse.json({ ok: true, profile: responseProfile });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
