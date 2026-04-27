import { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { cookies } from "next/headers";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { getStripeClient } from "@/app/lib/stripeClient";
import {
  getCachedProfile,
  invalidateCachedProfile,
  setCachedProfile,
} from "@/app/lib/profile-cache";
import { mergeGuestProfileIntoUserProfile } from "@/app/lib/profile/mergeGuestProfile";
import {
  getSafePrivateProfileFields,
  readRawPrivateProfileFieldsByIds,
} from "@/app/lib/profile/privateProfileFields";
import { GUEST_USER_COOKIE } from "@/app/lib/onboarding/start";

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

async function upsertUserProfileByUserId(userId: string, data: Record<string, unknown>) {
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
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

async function syncStripeSubscriptionStatus(params: {
  userId: string;
  sessionEmail: string | null;
  profileEmail: string | null;
}) {
  const checkedAt = new Date();
  const emailToLookup = normalizeText(params.profileEmail) ?? normalizeText(params.sessionEmail);

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
    ...(latestSubscription.status === "active" || latestSubscription.status === "trialing"
      ? { lastPaymentReceivedAt: checkedAt }
      : {}),
  });
}

const profileSelect = Prisma.validator<Prisma.UserProfileSelect>()({
  id: true,
  userId: true,
  guestId: true,
  skills: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  country: true,
  countryCode: true,
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

  // Add multi-link profile fields only after the Prisma schema and profile API migrate together.
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
});

export function buildProfileSelect() {
  return profileSelect;
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

export function serializeProfileResponse<
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

function mapProfileToResponse(
  profile: Prisma.UserProfileGetPayload<{ select: typeof profileSelect }> | null,
  rawPrivateFieldsById: Map<string, unknown>
) {
  const serializedProfile = serializeProfileResponse(profile, rawPrivateFieldsById);

  if (!serializedProfile) {
    return null;
  }

  return {
    ...serializedProfile,
    expertise: (() => {
      if (
        serializedProfile.keyQuestions &&
        typeof serializedProfile.keyQuestions === "object" &&
        !Array.isArray(serializedProfile.keyQuestions)
      ) {
        const rawExpertise = (serializedProfile.keyQuestions as Record<string, unknown>)
          .expertise;
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
  };
}

export type ViewerProfileResponse = ReturnType<typeof mapProfileToResponse>;

type ProfileViewerSession = {
  user?: {
    id?: string;
    email?: string | null;
  } | null;
} | null;

type GetCurrentViewerProfileOptions = {
  session?: ProfileViewerSession;
  useCache?: boolean;
  syncStripe?: boolean;
  mergeGuestIntoUser?: boolean;
};

export async function getCurrentViewerProfile(
  options: GetCurrentViewerProfileOptions = {}
) {
  const session = (options.session ?? (await auth())) as ProfileViewerSession;
  const userId = session?.user?.id ?? null;
  const sessionEmail = session?.user?.email ?? null;
  const cookieStore = await cookies();
  let guestId = cookieStore.get(GUEST_USER_COOKIE)?.value ?? null;
  let mergedGuestProfile = false;
  const shouldMergeGuestIntoUser = options.mergeGuestIntoUser !== false;

  if (userId && guestId && shouldMergeGuestIntoUser) {
    const guestIdToMerge = guestId;
    const mergeResult = await prisma.$transaction((tx) =>
      mergeGuestProfileIntoUserProfile(tx, {
        userId,
        guestId: guestIdToMerge,
        email: sessionEmail,
      })
    );

    if (mergeResult.merged) {
      mergedGuestProfile = true;
      invalidateCachedProfile({ userId, guestId: guestIdToMerge });
      guestId = null;
    }
  }

  const effectiveGuestId = userId && !shouldMergeGuestIntoUser ? null : guestId;

  if (!userId && !effectiveGuestId) {
    return {
      session,
      userId,
      guestId: effectiveGuestId,
      mergedGuestProfile,
      responseData: {
        ok: true as const,
        profile: null,
      },
    };
  }

  if (options.useCache) {
    const cachedProfile = getCachedProfile<{ ok: true; profile: ViewerProfileResponse }>({
      userId,
      guestId: effectiveGuestId,
    });
    if (cachedProfile) {
      return {
        session,
        userId,
        guestId: effectiveGuestId,
        mergedGuestProfile,
        responseData: cachedProfile,
      };
    }
  }

  if (options.syncStripe && userId) {
    const currentProfile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { email: true },
    });

    try {
      await syncStripeSubscriptionStatus({
        userId,
        sessionEmail,
        profileEmail: currentProfile?.email ?? null,
      });
    } catch {
      try {
        await upsertUserProfileByUserId(userId, { subscriptionCheckedAt: new Date() });
      } catch {
        // swallow
      }
    }
  }

  const profile = userId
    ? await prisma.userProfile.findUnique({
        where: { userId },
        select: buildProfileSelect(),
      })
    : await prisma.userProfile.findUnique({
        where: { guestId: effectiveGuestId as string },
        select: buildProfileSelect(),
      });

  const rawPrivateFieldsById = await readRawPrivateProfileFieldsByIds(
    prisma,
    profile ? [profile.id] : []
  );
  const responseData = {
    ok: true as const,
    profile: mapProfileToResponse(profile, rawPrivateFieldsById),
  };

  if (options.useCache) {
    setCachedProfile({
      userId,
      guestId: effectiveGuestId,
      data: responseData,
    });
  }

  return {
    session,
    userId,
    guestId: effectiveGuestId,
    mergedGuestProfile,
    responseData,
  };
}
