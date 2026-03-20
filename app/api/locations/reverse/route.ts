import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json({ error: "Missing lat/lon" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing GOOGLE_MAPS_API_KEY" }, { status: 500 });
  }

  const endpoint =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lon)}` +
    `&key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    const data = await res.json();

    if (!res.ok || data.status !== "OK") {
      return NextResponse.json({ error: "Reverse geocode failed" }, { status: 500 });
    }

    const result = data.results[0];
    if (!result) return NextResponse.json({ label: "" });

    let city = "";
    let stateCode = "";
    let stateName = "";

    for (const c of result.address_components) {
      if (c.types.includes("locality")) city = c.long_name;
      if (c.types.includes("administrative_area_level_1")) {
        stateCode = c.short_name;
        stateName = c.long_name;
      }
    }

    const label = [city, stateCode].filter(Boolean).join(", ");

    return NextResponse.json({ label, city, stateCode, stateName });
  } catch {
    return NextResponse.json({ error: "Reverse geocode error" }, { status: 500 });
  }
}
