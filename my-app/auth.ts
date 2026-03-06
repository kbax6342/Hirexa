import "server-only";

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/prisma";

const PAID_PAYMENT_STATUSES = ["paid", "succeeded", "active", "trialing"];
const ACTIVE_PLAN_STATUSES = ["active", "trialing", "paid", "succeeded"];

async function resolvePaidAccess(userId: string): Promise<boolean> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      registrationStatus: true,
      trialSubscriber: true,
      monthlySubscriber: true,
      yearlySubscriber: true,
      trialPlanStatus: true,
      monthlyPlanStatus: true,
      yearlyPlanStatus: true,
      lastPaymentReceivedAt: true,
      stripePayments: {
        where: { status: { in: PAID_PAYMENT_STATUSES } },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!profile) return false;
  if (profile.stripePayments.length > 0) return true;
  if (profile.trialSubscriber || profile.monthlySubscriber || profile.yearlySubscriber) return true;
  if (
    [profile.trialPlanStatus, profile.monthlyPlanStatus, profile.yearlyPlanStatus].some(
      (status) => status && ACTIVE_PLAN_STATUSES.includes(status),
    )
  ) {
    return true;
  }
  if (profile.registrationStatus === "paid" || profile.registrationStatus === "active") {
    return true;
  }

  return Boolean(profile.lastPaymentReceivedAt);
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

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
  ],

  secret: process.env.AUTH_SECRET,

  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        (token as { id?: string }).id = user.id;
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const userId = (token as { id?: string }).id ?? token.sub;
        (session.user as { id?: string; hasPaidAccess?: boolean }).id = userId;
        (session.user as { id?: string; hasPaidAccess?: boolean }).hasPaidAccess = userId ? await resolvePaidAccess(userId) : false;
      }
      return session;
    },
  },
});
