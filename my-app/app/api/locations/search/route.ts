// app/api/locations/search/route.ts

import { NextResponse } from "next/server";

type LocationOption = {
  id: string;
  label: string;
  lat?: number;
  lon?: number;
};

export async function GET(req: Request) {
  console.log("📍 /api/locations/search HIT");

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  console.log("🔎 Query:", q);

  if (!q) {
    console.log("⚠️ Empty query — returning no options");
    return NextResponse.json({ options: [] });
  }

  // must be set in .env.local
  const username = process.env.GEONAMES_USERNAME;

  if (!username) {
    console.error("❌ Missing GEONAMES_USERNAME in environment");
    return NextResponse.json(
      { error: "Missing GEONAMES_USERNAME" },
      { status: 500 }
    );
  }

  const endpoint =
    `https://secure.geonames.org/searchJSON?` +
    `name_startsWith=${encodeURIComponent(q)}` +
    `&country=US` +
    `&featureClass=P` + // populated places (cities/towns)
    `&maxRows=20` +
    `&orderby=relevance` +
    `&username=${encodeURIComponent(username)}`;

  console.log("🌍 GeoNames request:", endpoint);

  try {
    const res = await fetch(endpoint, { cache: "no-store" });

    if (!res.ok) {
      console.error("❌ GeoNames HTTP error:", res.status);
      return NextResponse.json(
        { options: [], error: "GeoNames request failed" },
        { status: 500 }
      );
    }

    const data = await res.json();
    console.log("📦 Raw GeoNames response:", data);

    const geos = Array.isArray(data?.geonames) ? data.geonames : [];

    const options: LocationOption[] = geos.map((g: any) => {
      const city = String(g?.name ?? "").trim();
      const state = String(g?.adminCode1 ?? "").trim(); // e.g. CA, NY
      const label = state ? `${city}, ${state}` : city;

      return {
        id: `geonames:${g?.geonameId ?? label}`,
        label,
        lat: g?.lat ? Number(g.lat) : undefined,
        lon: g?.lng ? Number(g.lng) : undefined,
      };
    });

    console.log("✅ Parsed location options:", options);

    return NextResponse.json({ options });
  } catch (err) {
    console.error("🔥 Unexpected error:", err);
    return NextResponse.json(
      { options: [], error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
