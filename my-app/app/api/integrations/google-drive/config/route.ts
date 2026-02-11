import { NextResponse } from "next/server";

const CLIENT_ID_KEYS = [
  "NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID",
  "GOOGLE_DRIVE_CLIENT_ID",
  "GOOGLE_CLIENT_ID",
] as const;

const API_KEY_KEYS = [
  "NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY",
  "GOOGLE_DRIVE_API_KEY",
  "GOOGLE_API_KEY",
] as const;

function getFirstConfiguredEnv(keys: readonly string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }

  return null;
}

export async function GET() {
  const clientId = getFirstConfiguredEnv(CLIENT_ID_KEYS);
  const apiKey = getFirstConfiguredEnv(API_KEY_KEYS);

  if (!clientId || !apiKey) {
    return NextResponse.json(
      {
        configured: false,
        missing: {
          clientId: !clientId,
          apiKey: !apiKey,
        },
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    configured: true,
    config: {
      clientId,
      apiKey,
    },
  });
}
