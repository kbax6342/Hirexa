// File: /Hirexa/my-app/app/lib/agents/getAuthedUser.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";

type SessionUser = {
  id?: string;
};

export async function getAuthedUserId(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  return user?.id ?? null;
}

export function unauthorizedJson(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401 }
  );
}

export async function requireAuthedUserId(): Promise<
  { userId: string; response: null } | { userId: null; response: NextResponse }
> {
  const userId = await getAuthedUserId();

  if (!userId) {
    return {
      userId: null,
      response: unauthorizedJson(),
    };
  }

  return {
    userId,
    response: null,
  };
}