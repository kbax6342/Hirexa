// /Hirexa/my-app/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";
import { cookies } from "next/headers";
import { getStripeClient } from "@/app/lib/stripeClient";
import { deriveLocationLabel } from "@/app/lib/locationOptions";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";
import { mergeGuestProfileIntoUserProfile } from "@/app/lib/profile/mergeGuestProfile";
import {
  getSafePrivateProfileFields,
  PrivateProfileFieldValidationError,
  sanitizePrivateProfileFields,
} from "@/app/lib/profile/privateProfileFields";
import {
  ensureGuestOnboardingProfile,
  getGuestUserCookieOptions,
  GUEST_USER_COOKIE,
} from "@/app/lib/onboarding/start";
import { syncLoopsContact } from "@/app/lib/email/loops";
import type Stripe from "stripe";
import { getCurrentViewerProfile } from "@/app/lib/profile-server";

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

function nextRegistrationStatusAfterProfileSave(currentStatus?: string | null) {
  if (
    currentStatus === "QUESTIONS_COMPLETE_PENDING_BENEFITS" ||
    currentStatus === "KEY_QUESTIONS_COMPLETE" ||
    currentStatus === "BENEFITS_COMPLETE"
  ) {
    return currentStatus;
  }

  return "PROFILE_COMPLETE";
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
    const cookieStore = await cookies();
    let guestId = cookieStore.get(GUEST_USER_COOKIE)?.value ?? null;
    const originalGuestId = guestId;
    const shouldSetGuestCookie = !userId && !guestId;
    let mergedGuestProfile = false;

    if (userId && guestId) {
      const existingGuestId = guestId;
      const mergeResult = await prisma.$transaction((tx) =>
        mergeGuestProfileIntoUserProfile(tx, {
          userId,
          guestId: existingGuestId,
          email: (session?.user as any)?.email ?? null,
        })
      );

      if (mergeResult.merged) {
        mergedGuestProfile = true;
        invalidateCachedProfile({ userId, guestId: existingGuestId });
        guestId = null;
      }
    }

    if (!userId && !guestId) {
      guestId = await ensureGuestOnboardingProfile(null);
    }

    const normalizedEmail = normalizeText(body.email) ?? (session?.user as any)?.email ?? null;
    const privateFields = sanitizePrivateProfileFields({
      dob: body.dob,
      address: body.address,
      city: body.city,
      postalCode: body.postalCode,
      state: body.state,
    });
    const profileWhere = userId ? { userId } : { guestId: guestId as string };
    const profileCreateScope = userId ? { userId } : { guestId: guestId as string };

    const existingProfile = await prisma.userProfile.findUnique({
      where: profileWhere,
      select: {
        workplaceLocations: true,
        registrationStatus: true,
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
      where: profileWhere,
      create: {
        ...profileCreateScope,
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
        registrationStatus: nextRegistrationStatusAfterProfileSave(
          existingProfile?.registrationStatus
        ),
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
        registrationStatus: nextRegistrationStatusAfterProfileSave(
          existingProfile?.registrationStatus
        ),
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
        newsletterOptIn: true,
        newsletterSource: true,
        unsubscribedAt: true,
      },
    });

    if (profile.email) {
      await syncLoopsContact({
        email: profile.email,
        userId: userId ?? guestId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        source: profile.newsletterSource ?? "profile/update",
        subscribed:
          profile.newsletterOptIn && !profile.unsubscribedAt ? true : undefined,
        userGroup: userId ? "hirexa_users" : "hirexa_guests",
      });
    }

    invalidateCachedProfile({ userId, guestId: originalGuestId ?? guestId });

    const response = NextResponse.json({
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

    if (mergedGuestProfile) {
      response.cookies.set(GUEST_USER_COOKIE, "", {
        path: "/",
        maxAge: 0,
      });
    } else if (shouldSetGuestCookie && guestId) {
      response.cookies.set(GUEST_USER_COOKIE, guestId, getGuestUserCookieOptions());
    }

    return response;
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
    const { userId, guestId, mergedGuestProfile, responseData } =
      await getCurrentViewerProfile({
        useCache: true,
        syncStripe: true,
      });

    if (!userId && !guestId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (process.env.NODE_ENV !== "production") {
      const responseProfileRecord =
        responseData.profile && typeof responseData.profile === "object"
          ? (responseData.profile as Record<string, unknown>)
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

