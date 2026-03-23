import "server-only";

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/prisma";
import { getOnboardingStatusForUser } from "@/app/lib/onboarding/status";
import { validateSecurityEnvironment } from "@/lib/security/env";

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const useSecureCookies = process.env.NODE_ENV === "production";

validateSecurityEnvironment();

type CallbackUserWithFlags = {
  id?: string;
  isExistingUser?: boolean;
};

type TokenWithFlags = {
  id?: string;
  isExistingUser?: boolean;
  questionsCompleted?: boolean;
};

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function splitDisplayName(name: string | null | undefined) {
  const normalized = name?.trim() || "";
  if (!normalized) {
    return { firstName: null, lastName: null };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(" ") || null,
  };
}

async function ensureLocalUserForGoogle(params: {
  email?: string | null;
  name?: string | null;
}) {
  const email = normalizeEmail(params.email);
  if (!email) return null;

  const name = params.name?.trim() || null;
  const { firstName, lastName } = splitDisplayName(name);

  return prisma.$transaction(async (tx) => {
    const localUser = await tx.user.upsert({
      where: { email },
      create: {
        email,
        name,
        isGuest: false,
        emailVerifiedAt: new Date(),
      },
      update: {
        name: name ?? undefined,
        isGuest: false,
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    const existingProfileByUserId = await tx.userProfile.findUnique({
      where: { userId: localUser.id },
      select: { id: true },
    });

    if (existingProfileByUserId) {
      await tx.userProfile.update({
        where: { id: existingProfileByUserId.id },
        data: {
          email,
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
        },
      });
    } else {
      const existingProfileByEmail = await tx.userProfile.findFirst({
        where: { email },
        select: { id: true, registrationStatus: true },
      });

      if (existingProfileByEmail) {
        await tx.userProfile.update({
          where: { id: existingProfileByEmail.id },
          data: {
            userId: localUser.id,
            email,
            ...(firstName ? { firstName } : {}),
            ...(lastName ? { lastName } : {}),
          },
        });
      } else {
        await tx.userProfile.create({
          data: {
            userId: localUser.id,
            email,
            firstName,
            lastName,
            registrationStatus: "registered",
          },
        });
      }
    }

    return localUser;
  });
}

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
  ],

  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") {
        return true;
      }

      const email = normalizeEmail(user.email ?? null);
      if (!email) {
        return false;
      }

      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      const wasExistingUser = Boolean(existingUser);

      const localUser = await ensureLocalUserForGoogle({
        email,
        name: user.name ?? null,
      });

      if (!localUser) {
        return false;
      }

      const callbackUser = user as typeof user & CallbackUserWithFlags;
      callbackUser.id = localUser.id;
      callbackUser.isExistingUser = wasExistingUser;
      user.email = localUser.email;
      user.name = localUser.name ?? user.name;

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
      } else if (authToken.id == null && token.email) {
        const localUser = await ensureLocalUserForGoogle({
          email: token.email,
          name: token.name ?? null,
        });

        if (localUser) {
          authToken.id = localUser.id;
          token.sub = localUser.id;
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
      }
      return session;
    },
  },
});
