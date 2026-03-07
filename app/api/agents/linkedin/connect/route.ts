// /Hirexa/my-app/app/api/agents/linkedin/connect/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getAuthedUserId, unauthorizedJson } from "@/app/lib/agents/getAuthedUser";

function redactDatabaseUrl(raw: string | undefined) {
  if (!raw) return "unknown";
  try {
    const url = new URL(raw);
    const dbName = url.pathname.replace("/", "") || "unknown_db";
    return `${url.protocol}//${url.host}/${dbName}`;
  } catch {
    return "unknown";
  }
}

async function logDbDebugInfo() {
  if (process.env.OUTREACH_DEBUG !== "1") return;
  const safeUrl = redactDatabaseUrl(process.env.DATABASE_URL);
  console.info("[outreach] DATABASE_URL =", safeUrl);
  console.info("[outreach] NODE_ENV =", process.env.NODE_ENV ?? "unknown");

  try {
    const columns = (await prisma.$queryRawUnsafe<
      Array<{ column_name: string }>
    >(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name ilike 'linkedinaccount' order by ordinal_position`
    )) as Array<{ column_name: string }>;
    console.info(
      "[outreach] LinkedInAccount columns =",
      columns.map((c) => c.column_name).join(", ") || "(none)"
    );
  } catch (err) {
    console.warn("[outreach] Failed to inspect LinkedInAccount columns", err);
  }
}

function normalizeSkills(input: unknown) {
  let raw: string[] = [];
  if (Array.isArray(input)) {
    raw = input.map((item) => String(item));
  } else if (typeof input === "string") {
    raw = input.split(",").map((value) => value.trim());
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of raw) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

export async function GET() {
  try {
    const userId = await getAuthedUserId();
    if (!userId) return unauthorizedJson();

    const account = await prisma.linkedInAccount.findUnique({ where: { userId } });
    return NextResponse.json({ ok: true, connected: Boolean(account), account });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await logDbDebugInfo();
    return NextResponse.json(
      { ok: false, error: "Use LinkedIn OAuth routes to connect." },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const userId = await getAuthedUserId();
    if (!userId) return unauthorizedJson();

    await prisma.linkedInAccount.deleteMany({ where: { userId } });
    return NextResponse.json({ ok: true, connected: false });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await getAuthedUserId();
    if (!userId) return unauthorizedJson();

    const body = (await req.json().catch(() => null)) as
      | { importedSkills?: unknown }
      | null;

    const importedSkills = normalizeSkills(body?.importedSkills);

    const account = await prisma.linkedInAccount.findUnique({ where: { userId } });
    if (!account) {
      return NextResponse.json(
        { ok: false, error: "LinkedIn is not connected." },
        { status: 400 }
      );
    }

    const updated = await prisma.linkedInAccount.update({
      where: { userId },
      data: {
        importedSkills,
      },
    });

    return NextResponse.json({ ok: true, connected: true, account: updated });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
