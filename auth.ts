import "server-only";

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import LinkedIn from "next-auth/providers/linkedin";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/prisma";
import {
  getHirexaVerificationGateForUser,
  normalizeAuthEmail,
  upsertLocalUserAndProfileForSocialAuth,
} from "@/app/lib/auth/hirexaVerification";
import { getOnboardingStatusForUser } from "@/app/lib/onboarding/status";
import { validateSecurityEnvironment } from "@/lib/security/env";
import { resolveVerificationContext } from "@/app/lib/verification/context";
import { sendVerificationCode } from "@/app/lib/verification/service";

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const appleClientId = process.env.APPLE_CLIENT_ID?.trim();
const appleClientSecret = process.env.APPLE_CLIENT_SECRET?.trim();
const linkedInClientId = process.env.LINKEDIN_CLIENT_ID?.trim();
const linkedInClientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
const useSecureCookies = process.env.NODE_ENV === "production";
const ACCOUNT_VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const ACCOUNT_VERIFICATION_RESEND_COOLDOWN_MS = 30 * 1000;

validateSecurityEnvironment();

type CallbackUserWithFlags = {
  id?: string;
  isExistingUser?: boolean;
  requiresVerification?: boolean;
};

type TokenWithFlags = {
  id?: string;
  isExistingUser?: boolean;
  questionsCompleted?: boolean;
  requiresVerification?: boolean;
};

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  // Vercel terminates TLS before the app, so production auth cookies should
  // stay marked secure and only travel over HTTPS.
  useSecureCookies,

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, password: true },
        });

        if (!user?.password) return null;

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
    ...(googleClientId && googleClientSecret
      ? [
          Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          }),
        ]
      : []),
    ...(appleClientId && appleClientSecret
      ? [
          Apple({
            clientId: appleClientId,
            clientSecret: appleClientSecret,
          }),
        ]
      : []),
    ...(linkedInClientId && linkedInClientSecret
      ? [
          LinkedIn({
            clientId: linkedInClientId,
            clientSecret: linkedInClientSecret,
            authorization: {
              params: { scope: "openid profile email" },
            },
            profile(profile) {
              const record = profile as Record<string, unknown>;
              const givenName = String(record.given_name ?? "").trim();
              const familyName = String(record.family_name ?? "").trim();
              const fullName = String(record.name ?? [givenName, familyName].filter(Boolean).join(" ")).trim();
              return {
                id: String(record.sub ?? record.id ?? ""),
                name: fullName || null,
                email: typeof record.email === "string" ? record.email : null,
                image:
                  typeof record.picture === "string"
                    ? record.picture
                    : typeof record.profilePicture === "string"
                      ? record.profilePicture
                      : null,
              };
            },
          }),
        ]
      : []),
  ],

  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,

  callbacks: {
    async signIn({ user, account }) {
      const provider = account?.provider;
      if (provider !== "google" && provider !== "apple" && provider !== "linkedin") {
        return true;
      }

      const email = normalizeAuthEmail(user.email ?? null);
      if (!email) {
        return false;
      }

      const socialAccount = await upsertLocalUserAndProfileForSocialAuth({
        email,
        name: user.name ?? null,
      });

      if (!socialAccount) {
        return false;
      }

      if (!socialAccount.alreadyVerified) {
        try {
          const context = await resolveVerificationContext({
            userId: socialAccount.localUser.id,
            sessionEmail: email,
          });
          const destination = context.destination ?? email;
          const sendResult = await sendVerificationCode({
            channel: context.resolvedChannel,
            destination,
            purpose: "account_setup",
            ttlMs: ACCOUNT_VERIFICATION_CODE_TTL_MS,
            resendCooldownMs: ACCOUNT_VERIFICATION_RESEND_COOLDOWN_MS,
            skipCooldown: true,
          });

          if (!sendResult.ok) {
            throw new Error(sendResult.message);
          }
        } catch (error) {
          console.error("[auth] failed to send verification code for social sign-in", {
            provider,
            email,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          return false;
        }
      }

      const callbackUser = user as typeof user & CallbackUserWithFlags;
      callbackUser.id = socialAccount.localUser.id;
      callbackUser.isExistingUser = socialAccount.wasExistingUser;
      callbackUser.requiresVerification = !socialAccount.alreadyVerified;
      user.email = socialAccount.localUser.email;
      user.name = socialAccount.localUser.name ?? user.name;

      return true;
    },
    async jwt({ token, user }) {
      const authToken = token as typeof token & TokenWithFlags;
      const callbackUser = user as (typeof user & CallbackUserWithFlags) | undefined;

      if (callbackUser?.id) {
        authToken.id = callbackUser.id;
        token.sub = callbackUser.id;

        if (typeof callbackUser.isExistingUser === "boolean") {
          authToken.isExistingUser = callbackUser.isExistingUser;
        } else {
          delete authToken.isExistingUser;
        }

        if (typeof callbackUser.requiresVerification === "boolean") {
          authToken.requiresVerification = callbackUser.requiresVerification;
        } else {
          delete authToken.requiresVerification;
        }
      } else if (authToken.id == null && token.email) {
        const normalizedTokenEmail = normalizeAuthEmail(token.email);

        if (normalizedTokenEmail) {
          const localUser = await prisma.user.findUnique({
            where: { email: normalizedTokenEmail },
            select: { id: true },
          });

          if (localUser?.id) {
            authToken.id = localUser.id;
            token.sub = localUser.id;
          }
        }
      }

      if (authToken.id ?? token.sub) {
        try {
          const verification = await getHirexaVerificationGateForUser(
            authToken.id ?? token.sub
          );
          authToken.requiresVerification = verification.requiresVerification;
        } catch (error) {
          console.error("[auth] failed to load verification gate for session token", {
            userId: authToken.id ?? token.sub ?? null,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          authToken.requiresVerification = false;
        }
      }

      try {
        const onboarding = await getOnboardingStatusForUser(
          authToken.id ?? token.sub
        );
        authToken.questionsCompleted = onboarding.completed;
      } catch (error) {
        console.error("[auth] failed to load onboarding status for session token", {
          userId: authToken.id ?? token.sub ?? null,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        authToken.questionsCompleted = false;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const authToken = token as typeof token & TokenWithFlags;
        const sessionUser = session.user as typeof session.user & TokenWithFlags;
        const resolvedUserId = authToken.id ?? token.sub;

        if (resolvedUserId) {
          sessionUser.id = resolvedUserId;
        }
        sessionUser.questionsCompleted = Boolean(authToken.questionsCompleted);

        if (typeof authToken.isExistingUser === "boolean") {
          sessionUser.isExistingUser = authToken.isExistingUser;
        }

        if (typeof authToken.requiresVerification === "boolean") {
          sessionUser.requiresVerification = authToken.requiresVerification;
        }
      }
      return session;
    },
  },
});
