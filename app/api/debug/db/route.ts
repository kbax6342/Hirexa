import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

type TableExistsRow = {
  table_name: string;
};

function getRedactedDatabaseUrlSummary() {
  const raw = process.env.DATABASE_URL?.trim() ?? "";
  if (!raw) {
    return {
      configured: false,
      host: null,
      database: null,
    };
  }

  try {
    const parsed = new URL(raw);
    return {
      configured: true,
      host: parsed.hostname || null,
      database: parsed.pathname.replace(/^\/+/, "") || null,
    };
  } catch {
    return {
      configured: true,
      host: null,
      database: null,
    };
  }
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [dbInfoRows, tableRows] = await Promise.all([
    prisma.$queryRaw<Array<{ current_database: string; current_schema: string }>>`
      select current_database() as current_database, current_schema() as current_schema
    `,
    prisma.$queryRaw<TableExistsRow[]>`
      select table_name
      from information_schema.tables
      where table_schema = current_schema()
        and table_name in ('HirePilotCreditGrant', 'HirePilotCreditUsage')
    `,
  ]);

  const dbInfo = dbInfoRows[0] ?? {
    current_database: null,
    current_schema: null,
  };
  const existingTables = new Set(tableRows.map((row) => row.table_name));

  return NextResponse.json({
    database: {
      name: dbInfo.current_database,
      schema: dbInfo.current_schema,
    },
    tables: {
      HirePilotCreditGrant: existingTables.has("HirePilotCreditGrant"),
      HirePilotCreditUsage: existingTables.has("HirePilotCreditUsage"),
    },
    databaseUrl: getRedactedDatabaseUrlSummary(),
  });
}
