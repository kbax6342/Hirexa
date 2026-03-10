import "server-only";

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/prisma";

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

async function getQuestionsCompleted(userId?: string | null) {
  if (!userId) return false;

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      questionsCompleted: true,
      keyQuestions: true,
      registrationStatus: true,
    },
  });

  return Boolean(
    profile?.questionsCompleted ||
      profile?.keyQuestions ||
      profile?.registrationStatus === "KEY_QUESTIONS_COMPLETE"
  );
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },

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
    async jwt({ token, user }) {
      if (user?.id) {
        (token as any).id = user.id;
        token.sub = user.id;
      }
      (token as any).questionsCompleted = await getQuestionsCompleted(
        ((token as any).id as string | undefined) ?? token.sub
      );
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token as any).id ?? token.sub;
        (session.user as any).questionsCompleted = Boolean(
          (token as any).questionsCompleted
        );
      }
      return session;
    },
  },
});
