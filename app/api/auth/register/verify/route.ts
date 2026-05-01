import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { verifyRecaptchaV3 } from "@/app/lib/security/recaptcha";
import { sendRegistrationConfirmedEmailIfNeeded } from "@/app/lib/email/lifecycle";
import { syncLoopsContact } from "@/app/lib/email/loops";
import { cleanupExpiredPendingVerifications } from "@/app/lib/auth/cleanupPendingVerification";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";
import { mergeGuestProfileIntoUserProfile } from "@/app/lib/profile/mergeGuestProfile";
import { commitOnboardingDraftToUserProfile } from "@/app/lib/onboarding/commit-draft";
import {
  clearOnboardingCookies,
  getActiveOnboardingDraftForCookies,
  markOnboardingDraftStatus,
} from "@/app/lib/onboarding/draft-session";
import {
  resolveVerificationContext,
} from "@/app/lib/verification/context";
import {
  verifyVerificationCode,
} from "@/app/lib/verification/service";
import { VERIFICATION_CHANNEL_SMS } from "@/app/lib/verification/types";
import {
  grantStarterHirePilotCredits,
  STARTER_FEATURE_CREDITS,
} from "@/app/lib/hirepilot/credits";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const guestId = cookieStore.get("guest_user_id")?.value ?? null;
    const draft = await getActiveOnboardingDraftForCookies(cookieStore);
    const session = await auth();
    const sessionUserId = (session?.user as { id?: string } | undefined)?.id ?? null;

    const body = await req.json();
    const code = String(body.code ?? "").trim();
    const recaptchaToken = body.recaptchaToken ?? null;

    const rc = await verifyRecaptchaV3(recaptchaToken, "signup_verify");
    if (!rc.ok) {
      return NextResponse.json({ error: rc.error }, { status: 403 });
    }

    try {
      await cleanupExpiredPendingVerifications();
    } catch (cleanupError) {
      console.warn("pending verification cleanup failed before signup verify:", cleanupError);
    }

    const context = await resolveVerificationContext({
      userId: sessionUserId,
      sessionEmail: session?.user?.email ? String(session.user.email) : null,
      cookieStore,
      requestedChannel: body.verificationChannel,
      requestedEmail: body.email,
      requestedPhone: body.phone,
    });
    const email = context.email;

    if (context.preferredChannel === VERIFICATION_CHANNEL_SMS && !context.normalizedPhone) {
      return NextResponse.json(
        { error: "Please enter a valid phone number." },
        { status: 400 }
      );
    }

    if (!email || !context.destination) {
      return NextResponse.json(
        { error: "The verification code has expired. Send a new code." },
        { status: 400 }
      );
    }

    const verification = await verifyVerificationCode({
      channel: context.resolvedChannel,
      destination: context.destination,
      code,
      maxAttempts: 6,
    });

    if (!verification.ok) {
      const status =
        verification.code === "too_many_attempts"
          ? 429
          : verification.code === "unavailable"
            ? 503
            : 400;
      return NextResponse.json({ error: verification.message }, { status });
    }

    const { userId } = await prisma.$transaction(async (tx) => {
      const verifiedAt = new Date();

      const user = sessionUserId
        ? await tx.user.update({
            where: { id: sessionUserId },
            data: {
              emailVerifiedAt: verifiedAt,
              isGuest: false,
            },
            select: { id: true, name: true, email: true },
          })
        : await tx.user.update({
            where: { email },
            data: {
              emailVerifiedAt: verifiedAt,
              isGuest: false,
            },
            select: { id: true, name: true, email: true },
          });

      const verifiedEmail = String(user.email ?? email).trim().toLowerCase();

      const destinationsToDelete = Array.from(
        new Set(
          [verifiedEmail, context.normalizedPhone].filter(
            (value): value is string => Boolean(value)
          )
        )
      );
      const emailDestinations = destinationsToDelete.filter((value) => value.includes("@"));

      await tx.emailOtp.deleteMany({
        where: {
          email: {
            in: destinationsToDelete,
          },
        },
      });

      if (emailDestinations.length > 0) {
        await tx.emailVerificationCode.deleteMany({
          where: {
            email: {
              in: emailDestinations,
            },
          },
        });
      }

      const [firstNameFromUser, ...remainingNameParts] = String(user.name ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const lastNameFromUser = remainingNameParts.join(" ").trim() || null;

      const mergeResult = guestId
        ? await mergeGuestProfileIntoUserProfile(tx, {
            userId: user.id,
            guestId,
            email: verifiedEmail,
          })
        : null;

      if (mergeResult?.profileId) {
        await tx.userProfile.update({
          where: { id: mergeResult.profileId },
          data: {
            email: verifiedEmail,
            subscriptionEmail: verifiedEmail,
            emailVerifiedAt: verifiedAt,
          },
          select: { id: true },
        });
      } else {
        await tx.userProfile.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            email: verifiedEmail,
            subscriptionEmail: verifiedEmail,
            emailVerifiedAt: verifiedAt,
            registrationStatus: "registered",
            firstName: firstNameFromUser || undefined,
            lastName: lastNameFromUser ?? undefined,
          },
          update: {
            email: verifiedEmail,
            subscriptionEmail: verifiedEmail,
            emailVerifiedAt: verifiedAt,
            registrationStatus: "registered",
            ...(firstNameFromUser
              ? { firstName: firstNameFromUser, lastName: lastNameFromUser }
              : {}),
          },
        });
      }

      if (draft) {
        await commitOnboardingDraftToUserProfile({
          tx,
          userId: user.id,
          draftPayload: draft.payload,
          guestId,
        });
      }

      return { userId: user.id };
    });

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { id: true, firstName: true, welcomeEmailSentAt: true, userId: true },
    });

    try {
      await grantStarterHirePilotCredits({
        userId,
        credits: STARTER_FEATURE_CREDITS,
      });
    } catch (starterCreditError) {
      console.warn("starter credit grant failed after verification:", starterCreditError);
    }

    if (profile?.id) {
      await syncLoopsContact({
        email,
        userId: profile.userId,
        firstName: profile.firstName,
        source: "auth/register/verify",
        userGroup: "hirexa_users",
      });

      await sendRegistrationConfirmedEmailIfNeeded(profile.id).catch((emailError) => {
        console.warn("Welcome email failed after verification:", emailError);
      });
    }

    invalidateCachedProfile({
      userId,
      guestId,
    });

    if (draft) {
      await markOnboardingDraftStatus({
        draftToken: draft.draftToken,
        status: "completed",
      });
    }

    const response = NextResponse.json({ ok: true });
    clearOnboardingCookies(response.cookies, { includeGuestCookie: true });

    return response;
  } catch (error) {
    console.error("signup verify error:", error);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
