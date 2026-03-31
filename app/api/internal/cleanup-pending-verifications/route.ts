import { NextResponse } from "next/server";

import { cleanupExpiredPendingVerifications } from "@/app/lib/auth/cleanupPendingVerification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readCronSecret(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  if (headerSecret) {
    return headerSecret;
  }

  const url = new URL(request.url);
  return url.searchParams.get("secret")?.trim() ?? "";
}

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim();

  if (!configuredSecret) {
    if (process.env.NODE_ENV !== "production") {
      return { ok: true as const };
    }

    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "CRON_SECRET is not configured." },
        { status: 500 }
      ),
    };
  }

  const providedSecret = readCronSecret(request);
  if (!providedSecret || providedSecret !== configuredSecret) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true as const };
}

async function handleCleanup(request: Request) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return auth.response;
  }

  const summary = await cleanupExpiredPendingVerifications();
  return NextResponse.json({ ok: true, summary });
}

export async function GET(request: Request) {
  return handleCleanup(request);
}

export async function POST(request: Request) {
  return handleCleanup(request);
}
