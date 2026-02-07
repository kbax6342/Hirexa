import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json({ error: "Missing lat/lon" }, { status: 400 });
  }

  // Nominatim reverse geocode
  const endpoint =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lon)}&zoom=10&addressdetails=1`;

  try {
    const res = await fetch(endpoint, {
      headers: {
        // Nominatim wants an identifying UA; put your app name
        "User-Agent": "Hirexa/1.0 (location reverse geocode)",
      },
      cache: "no-store",
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: "Reverse geocode failed" }, { status: 500 });
    }

    const addr = data?.address ?? {};
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.hamlet ||
      addr.county ||
      "";
    const state = addr.state || addr.region || "";

    const label = [city, state].filter(Boolean).join(", ").trim();

    return NextResponse.json({
      label: label || data?.display_name || "",
    });
  } catch {
    return NextResponse.json({ error: "Reverse geocode error" }, { status: 500 });
  }
}
