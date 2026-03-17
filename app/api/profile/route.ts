// /Hirexa/my-app/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";
import { cookies } from "next/headers";
import { getStripeClient } from "@/app/lib/stripeClient";
import { deriveLocationLabel } from "@/app/lib/locationOptions";
import {
  getCachedProfile,
  invalidateCachedProfile,
  setCachedProfile,
} from "@/app/lib/profile-cache";
import { mergeGuestProfileIntoUserProfile } from "@/app/lib/profile/mergeGuestProfile";
import {
  getSafePrivateProfileFields,
  PrivateProfileFieldValidationError,
  readRawPrivateProfileFieldsByIds,
  sanitizePrivateProfileFields,
} from "@/app/lib/profile/privateProfileFields";
import type Stripe from "stripe";

export const runtime = "nodejs";

type ProfileBody = {
  firstName?: string;
  lastName?: string;
  dob?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  phone?: string;
  email?: string;
};

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function dateFromDobString(value?: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function previewProfileValue(value: unknown) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}...` : trimmed;
}

function readFirstWorkplaceLocation(value: unknown) {
  if (!Array.isArray(value)) return null;

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const label = String((item as { label?: unknown }).label ?? "").trim();
    if (label) return label;
  }

  return null;
}

function planTypeFromSubscription(
  subscription: Stripe.Subscription
): "trial" | "monthly" | "yearly" {
  const hirexaPlan = subscription.metadata?.hirexa_plan;
  if (hirexaPlan === "trial") return "trial";
  if (hirexaPlan === "annual") return "yearly";

  const recurringInterval = subscription.items.data[0]?.price?.recurring?.interval;
  return recurringInterval === "year" ? "yearly" : "monthly";
}

function planStatusFromSubscription(subscription: Stripe.Subscription): string {
  return subscription.status ?? "unknown";
}

/**
 * ✅ Always use upsert (NOT updateMany) so:
 * - we never depend on the row existing
 * - we avoid silent "0 rows updated" issues
 */
async function upsertUserProfileByUserId(userId: string, data: Record<string, any>) {
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

type SerializedProfile<T extends { dobEncrypted?: unknown; dob?: unknown }> = Omit<
  T,
  "dobEncrypted" | "dob"
> & {
  dob: string | null;
  displayAddress: string | null;
  displayCity: string | null;
  displayPostalCode: string | null;
  displayState: string | null;
};

function serializeProfileResponse<
  T extends {
    id?: string;
    dobEncrypted?: unknown;
    dob?: unknown;
    address?: unknown;
    city?: unknown;
    postalCode?: unknown;
    state?: unknown;
  },
>(
  profile: T | null,
  rawPrivateFieldsById?: Map<string, unknown>
): SerializedProfile<T> | null {
  if (!profile) return null;

  const rawPrivateFields =
    typeof profile.id === "string" ? rawPrivateFieldsById?.get(profile.id) : undefined;
  const { dobEncrypted, ...rest } = profile as Record<string, unknown>;
  const safePrivateFields = getSafePrivateProfileFields({
    ...(typeof rawPrivateFields === "object" && rawPrivateFields ? rawPrivateFields : {}),
    ...profile,
  });

  return {
    ...rest,
    address: safePrivateFields.address,
    city: safePrivateFields.city,
    postalCode: safePrivateFields.postalCode,
    state: safePrivateFields.state,
    dob: safePrivateFields.dob,
    displayAddress: safePrivateFields.address,
    displayCity: safePrivateFields.city,
    displayPostalCode: safePrivateFields.postalCode,
    displayState: safePrivateFields.state,
  } as unknown as SerializedProfile<T>;
}

async function syncStripeSubscriptionStatus(params: {
  userId: string;
  sessionEmail: string | null;
  profileEmail: string | null;
}) {
  const checkedAt = new Date();
  const emailToLookup = normalizeText(params.profileEmail) ?? normalizeText(params.sessionEmail);

  // If we have no email, just mark checkedAt and exit
  if (!emailToLookup) {
    await upsertUserProfileByUserId(params.userId, { subscriptionCheckedAt: checkedAt });
    return;
  }

  const stripeClient = getStripeClient();
  const customers = await stripeClient.customers.list({ email: emailToLookup, limit: 1 });
  const customer = customers.data[0] ?? null;

  if (!customer) {
    await upsertUserProfileByUserId(params.userId, {
      trialSubscriber: false,
      monthlySubscriber: false,
      yearlySubscriber: false,
      trialPlanStatus: null,
      monthlyPlanStatus: null,
      yearlyPlanStatus: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionEmail: emailToLookup,
      subscriptionCheckedAt: checkedAt,
    });
    return;
  }

  const subscriptions = await stripeClient.subscriptions.list({
    customer: customer.id,
    status: "all",
    limit: 10,
  });

  const latestSubscription =
    subscriptions.data.sort((a, b) => b.created - a.created)[0] ?? null;

  if (!latestSubscription) {
    await upsertUserProfileByUserId(params.userId, {
      trialSubscriber: false,
      monthlySubscriber: false,
      yearlySubscriber: false,
      trialPlanStatus: null,
      monthlyPlanStatus: null,
      yearlyPlanStatus: null,
      stripeCustomerId: customer.id,
      stripeSubscriptionId: null,
      subscriptionEmail: emailToLookup,
      subscriptionCheckedAt: checkedAt,
    });
    return;
  }

  const planType = planTypeFromSubscription(latestSubscription);
  const status = planStatusFromSubscription(latestSubscription);
  const isActiveStatus = ["active", "trialing", "past_due", "unpaid"].includes(status);

  await upsertUserProfileByUserId(params.userId, {
    trialSubscriber: planType === "trial" ? isActiveStatus : false,
    monthlySubscriber: planType === "monthly" ? isActiveStatus : false,
    yearlySubscriber: planType === "yearly" ? isActiveStatus : false,
    trialPlanStatus: planType === "trial" ? status : null,
    monthlyPlanStatus: planType === "monthly" ? status : null,
    yearlyPlanStatus: planType === "yearly" ? status : null,
    stripeCustomerId: customer.id,
    stripeSubscriptionId: latestSubscription.id,
    subscriptionEmail: emailToLookup,
    subscriptionCheckedAt: checkedAt,
    subscriptionPurchasedAt: new Date(latestSubscription.created * 1000),
    // Only set when active/trialing; otherwise do not touch existing value
    ...(latestSubscription.status === "active" || latestSubscription.status === "trialing"
      ? { lastPaymentReceivedAt: checkedAt }
      : {}),
  });
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
    const userId = (session?.user as any)?.id ?? null;
    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const normalizedEmail = normalizeText(body.email) ?? (session?.user as any)?.email ?? null;
    const privateFields = sanitizePrivateProfileFields({
      dob: body.dob,
      address: body.address,
      city: body.city,
      postalCode: body.postalCode,
      state: body.state,
    });
    const existingProfile = await prisma.userProfile.findUnique({
      where: { userId },
      select: {
        workplaceLocations: true,
      },
    });
    const hasExplicitWorkplaceLocation = Boolean(
      readFirstWorkplaceLocation(existingProfile?.workplaceLocations)
    );
    const derivedWorkplaceLocation = !hasExplicitWorkplaceLocation
      ? deriveLocationLabel(privateFields.city, privateFields.state)
      : null;
    const derivedWorkplaceLocationsJson = derivedWorkplaceLocation
      ? ([{ label: derivedWorkplaceLocation }] as Prisma.InputJsonValue)
      : null;

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        firstName,
        lastName,
        email: normalizedEmail,
        subscriptionEmail: normalizedEmail,
        phone: normalizeText(body.phone),
        dob: dateFromDobString(privateFields.dob),
        address: null,
        addressEncrypted: privateFields.addressEncrypted,
        city: null,
        cityEncrypted: privateFields.cityEncrypted,
        citySearch: privateFields.citySearch,
        postalCode: null,
        postalCodeEncrypted: privateFields.postalCodeEncrypted,
        postalCodeSearch: privateFields.postalCodeSearch,
        state: null,
        stateEncrypted: privateFields.stateEncrypted,
        stateSearch: privateFields.stateSearch,
        linkedinUrl: normalizeText(body.linkedinUrl),
        portfolioUrl: normalizeText(body.portfolioUrl),
        ...(derivedWorkplaceLocationsJson
          ? { workplaceLocations: derivedWorkplaceLocationsJson }
          : {}),
      },
      update: {
        firstName,
        lastName,
        email: normalizedEmail ?? undefined,
        subscriptionEmail: normalizedEmail ?? undefined,
        phone: normalizeText(body.phone),
        dob: dateFromDobString(privateFields.dob),
        address: null,
        addressEncrypted: privateFields.addressEncrypted,
        city: null,
        cityEncrypted: privateFields.cityEncrypted,
        citySearch: privateFields.citySearch,
        postalCode: null,
        postalCodeEncrypted: privateFields.postalCodeEncrypted,
        postalCodeSearch: privateFields.postalCodeSearch,
        state: null,
        stateEncrypted: privateFields.stateEncrypted,
        stateSearch: privateFields.stateSearch,
        linkedinUrl: normalizeText(body.linkedinUrl),
        portfolioUrl: normalizeText(body.portfolioUrl),
        ...(!hasExplicitWorkplaceLocation && derivedWorkplaceLocationsJson
          ? { workplaceLocations: derivedWorkplaceLocationsJson }
          : {}),
      },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        linkedinUrl: true,
        portfolioUrl: true,
      },
    });

    invalidateCachedProfile({ userId, guestId });

    return NextResponse.json({
      ok: true,
      profile: serializeProfileResponse({
        ...profile,
        address: privateFields.address,
        city: privateFields.city,
        postalCode: privateFields.postalCode,
        state: privateFields.state,
        dob: privateFields.dob,
      }),
    });
  } catch (e: unknown) {
    if (e instanceof PrivateProfileFieldValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;

    if (!userId && !guestId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let mergedGuestProfile = false;
    if (userId && guestId) {
      const mergeResult = await prisma.$transaction((tx) =>
        mergeGuestProfileIntoUserProfile(tx, {
          userId,
          guestId,
          email: (session?.user as any)?.email ?? null,
        })
      );

      if (mergeResult.merged) {
        mergedGuestProfile = true;
        invalidateCachedProfile({ userId, guestId });
      }
    }

    const cachedProfile = getCachedProfile<{ ok: boolean; profile: unknown }>({
      userId,
      guestId,
    });
    if (cachedProfile) {
      return NextResponse.json(cachedProfile);
    }

    // If logged in, sync Stripe status (never let it kill the profile response)
    if (userId) {
      const currentProfile = await prisma.userProfile.findUnique({
        where: { userId },
        select: { email: true },
      });

      try {
        await syncStripeSubscriptionStatus({
          userId,
          sessionEmail: (session?.user as any)?.email ?? null,
          profileEmail: currentProfile?.email ?? null,
        });
      } catch {
        // Best-effort mark checkedAt; ignore if DB isn’t ready
        try {
          await upsertUserProfileByUserId(userId, { subscriptionCheckedAt: new Date() });
        } catch {
          // swallow
        }
      }
    }

    // Fetch the profile (unique queries where possible)
    const profile = userId
      ? await prisma.userProfile.findUnique({
          where: { userId },
          select: buildProfileSelect(),
        })
      : await prisma.userProfile.findUnique({
          where: { guestId: guestId as string },
          select: buildProfileSelect(),
        });

    const rawPrivateFieldsById = await readRawPrivateProfileFieldsByIds(
      prisma,
      profile ? [profile.id] : []
    );
    const serializedProfile = serializeProfileResponse(profile, rawPrivateFieldsById);
    if (process.env.NODE_ENV !== "production" && profile) {
      const rawPrivateFields = rawPrivateFieldsById.get(profile.id);
      const rawPrivateFieldRecord =
        rawPrivateFields && typeof rawPrivateFields === "object"
          ? (rawPrivateFields as Record<string, unknown>)
          : null;

      console.info("[profile raw db]", {
        profileId: profile.id,
        address: previewProfileValue(rawPrivateFieldRecord?.address),
        addressEncrypted: previewProfileValue(rawPrivateFieldRecord?.addressEncrypted),
        addressLegacyDecrypted: previewProfileValue(rawPrivateFieldRecord?.addressLegacyDecrypted),
        city: previewProfileValue(rawPrivateFieldRecord?.city),
        cityEncrypted: previewProfileValue(rawPrivateFieldRecord?.cityEncrypted),
        cityLegacyDecrypted: previewProfileValue(rawPrivateFieldRecord?.cityLegacyDecrypted),
        state: previewProfileValue(rawPrivateFieldRecord?.state),
        stateEncrypted: previewProfileValue(rawPrivateFieldRecord?.stateEncrypted),
        stateLegacyDecrypted: previewProfileValue(rawPrivateFieldRecord?.stateLegacyDecrypted),
        postalCode: previewProfileValue(rawPrivateFieldRecord?.postalCode),
        postalCodeEncrypted: previewProfileValue(rawPrivateFieldRecord?.postalCodeEncrypted),
        postalCodeLegacyDecrypted: previewProfileValue(
          rawPrivateFieldRecord?.postalCodeLegacyDecrypted
        ),
      });
      console.info("[profile mapped view]", {
        profileId: profile.id,
        address: serializedProfile?.displayAddress ?? null,
        city: serializedProfile?.displayCity ?? null,
        state: serializedProfile?.displayState ?? null,
        postalCode: serializedProfile?.displayPostalCode ?? null,
      });
      console.info("[profile] resolved private display fields", {
        profileId: profile.id,
        addressResolved: Boolean(serializedProfile?.displayAddress),
        cityResolved: Boolean(serializedProfile?.displayCity),
        stateResolved: Boolean(serializedProfile?.displayState),
        postalCodeResolved: Boolean(serializedProfile?.displayPostalCode),
        usedPrimaryEncryptedColumns: Boolean(
          rawPrivateFields &&
            typeof rawPrivateFields === "object" &&
            ((rawPrivateFields as Record<string, unknown>).addressEncrypted ||
              (rawPrivateFields as Record<string, unknown>).cityEncrypted ||
              (rawPrivateFields as Record<string, unknown>).stateEncrypted ||
              (rawPrivateFields as Record<string, unknown>).postalCodeEncrypted)
        ),
        usedLegacyColumns: Boolean(
          rawPrivateFields &&
            typeof rawPrivateFields === "object" &&
            ((rawPrivateFields as Record<string, unknown>).address ||
              (rawPrivateFields as Record<string, unknown>).city ||
              (rawPrivateFields as Record<string, unknown>).state ||
              (rawPrivateFields as Record<string, unknown>).postalCode)
        ),
      });
    }
    const responseProfile = serializedProfile
      ? {
          ...serializedProfile,
          expertise: (() => {
            if (
              serializedProfile.keyQuestions &&
              typeof serializedProfile.keyQuestions === "object" &&
              !Array.isArray(serializedProfile.keyQuestions)
            ) {
              const rawExpertise = (serializedProfile.keyQuestions as Record<string, unknown>).expertise;
              if (Array.isArray(rawExpertise)) {
                return rawExpertise.map((item) => String(item ?? ""));
              }
            }
            return [];
          })(),
          profileImageUrl:
            serializedProfile.profileImage && serializedProfile.profileImageMimeType
              ? `data:${serializedProfile.profileImageMimeType};base64,${Buffer.from(
                  serializedProfile.profileImage
                ).toString("base64")}`
              : null,
        }
      : null;

    const responseData = { ok: true, profile: responseProfile };
    if (process.env.NODE_ENV !== "production") {
      const responseProfileRecord =
        responseProfile && typeof responseProfile === "object"
          ? (responseProfile as Record<string, unknown>)
          : null;

      console.info("[api/profile] final payload", {
        profileId: responseProfileRecord?.id ?? null,
        address:
          responseProfileRecord?.displayAddress ?? responseProfileRecord?.address ?? null,
        city: responseProfileRecord?.displayCity ?? responseProfileRecord?.city ?? null,
        state: responseProfileRecord?.displayState ?? responseProfileRecord?.state ?? null,
        postalCode:
          responseProfileRecord?.displayPostalCode ??
          responseProfileRecord?.postalCode ??
          null,
      });
    }
    setCachedProfile({ userId, guestId, data: responseData });

    const response = NextResponse.json(responseData);
    if (mergedGuestProfile) {
      response.cookies.set("guest_user_id", "", {
        path: "/",
        maxAge: 0,
      });
    }

    return response;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildProfileSelect() {
  return {
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
    subscriptionCheckedAt: true,
    subscriptionPurchasedAt: true,
    stripeCustomerId: true,
    stripeSubscriptionId: true,
    subscriptionEmail: true,

    emailVerifiedAt: true,
    unsubscribedAt: true,

    resumeSkills: true,
    minCompensation: true,
    compensationType: true,

    profileImage: true,
    profileImageMimeType: true,
    profileImageFilename: true,

    linkedinUrl: true,
    portfolioUrl: true,

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
          orderBy: { order: "asc" as const },
          select: {
            id: true,
            title: true,
            company: true,
            location: true,
            dateRange: true,
            bullets: {
              orderBy: { order: "asc" as const },
              select: {
                id: true,
                text: true,
              },
            },
          },
        },
      },
    },
  };
}
