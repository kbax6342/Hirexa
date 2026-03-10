import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

import QuestionsClient from "./questionsClient";

export default async function QuestionsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    redirect("/login");
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      questionsCompleted: true,
      keyQuestions: true,
      registrationStatus: true,
    },
  });

  if (
    profile?.questionsCompleted ||
    profile?.keyQuestions ||
    profile?.registrationStatus === "KEY_QUESTIONS_COMPLETE"
  ) {
    redirect("/dashboard");
  }

  return <QuestionsClient />;
}
