import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { verifyRecaptchaV3 } from "../../../../lib/security/recaptcha";
import { validatePassword, hashPassword } from "../../../../lib/security/password";
import { sendVerificationCodeEmail } from "@/app/lib/email/sendgrid";
import {
  classifyEmailFailure,
  normalizeEmailError,
} from "@/app/lib/email/errorDiagnostics";
import { cleanupExpiredPendingVerifications } from "@/app/lib/auth/cleanupPendingVerification";
import { issueHirexaVerificationCode } from "@/app/lib/auth/hirexaVerification";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";
import {
  getActiveOnboardingDraftForCookies,
  pickDraftGuestId,
  updateOnboardingDraftPayload,
} from "@/app/lib/onboarding/draft-session";

function normalizeName(value: unknown) {
  const name = String(value ?? "").trim();
  return name.length > 0 ? name : null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const firstName = normalizeName(body.firstName);
    const lastName = normalizeName(body.lastName);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const recaptchaToken = body.recaptchaToken ?? null;

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First name and last name are required." },
        { status: 400 }
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const rc = await verifyRecaptchaV3(recaptchaToken, "signup_init");
    if (!rc.ok) {
      return NextResponse.json({ error: rc.error }, { status: 403 });
    }

    const pw = validatePassword(password);
    if (!pw.ok) {
      return NextResponse.json({ error: "Password not strong enough" }, { status: 400 });
    }

    try {
      await cleanupExpiredPendingVerifications();
    } catch (cleanupError) {
      console.warn("pending verification cleanup failed before signup init:", cleanupError);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true },
    });

    if (existingUser?.emailVerifiedAt) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please log in instead." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const cookieStore = await cookies();
    const guestId = cookieStore.get("guest_user_id")?.value ?? null;
    const draft = await getActiveOnboardingDraftForCookies(cookieStore);

    await prisma.user.upsert({
      where: { email },
      create: {
        name: `${firstName} ${lastName}`,
        email,
        password: passwordHash,
        isGuest: false,
        emailVerifiedAt: null,
      },
      update: {
        name: `${firstName} ${lastName}`,
        password: passwordHash,
        isGuest: false,
        emailVerifiedAt: null,
      },
    });

    if (draft) {
      await updateOnboardingDraftPayload({
        draftToken: draft.draftToken,
        payloadPatch: {
          signup: {
            firstName,
            lastName,
            email,
          },
          profile: {
            firstName,
            lastName,
            email,
          },
          onboardingEmail: {
            email,
          },
        },
        guestId: pickDraftGuestId({ cookieStore, draft }) ?? guestId,
      });
    } else if (guestId) {
      invalidateCachedProfile({ userId: null, guestId });
    }

    const code = await issueHirexaVerificationCode(email);

    try {
      await sendVerificationCodeEmail(email, code);
    } catch (emailError) {
      const diagnostic = await normalizeEmailError(emailError);
      const classification = classifyEmailFailure(diagnostic);

      console.error("[REGISTER_INIT_EMAIL_SEND_FAILED]", {
        failureKind: classification.kind,
        providerMessage: classification.providerMessage,
        emailDomain: email.split("@")[1] ?? null,
        status: diagnostic.status,
        statusText: diagnostic.statusText,
        source: diagnostic.source,
        providerErrors: diagnostic.providerErrors,
        responseBody: diagnostic.responseBody,
        env: diagnostic.env,
        hasOnboardingDraft: Boolean(draft),
        hasGuestId: Boolean(guestId),
      });

      return NextResponse.json(
        { ok: false, error: "Verification email could not be sent." },
        { status: classification.status }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { ok: false, error: "Invalid request body." },
        { status: 400 }
      );
    }

    console.error("[REGISTER_INIT_FAILED]", {
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { ok: false, error: "Unable to start account verification right now." },
      { status: 500 }
    );
  }
}
