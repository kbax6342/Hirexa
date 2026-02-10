import { NextResponse } from "next/server";

type LocationOption = {
  id: string;
  label: string;
  lat?: number;
  lon?: number;
};

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q) return NextResponse.json({ options: [] });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { options: [], error: "Missing GOOGLE_MAPS_API_KEY" },
      { status: 500 }
    );
  }

  // ✅ Places API (New)
  // https://places.googleapis.com/v1/places:autocomplete
  try {
    const resp = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // FieldMask is required on many Places (New) calls
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
      },
      body: JSON.stringify({
        input: q,
        // US only (you can remove this if you want global)
        includedRegionCodes: ["US"],
        languageCode: "en",
        // Prefer cities/localities (Places Autocomplete is “fuzzy”, so this is “best effort”)
        includedPrimaryTypes: ["locality", "administrative_area_level_1"],
      }),
      cache: "no-store",
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      // show a useful error back to the client so you can see what Google said
      return NextResponse.json(
        { options: [], error: data?.error?.message ?? "Places autocomplete failed" },
        { status: 500 }
      );
    }

    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
    const options: LocationOption[] = suggestions
      .map((s: any) => {
        const p = s?.placePrediction;
        const placeId = String(p?.placeId ?? "");
        const label = String(p?.text?.text ?? "").trim();
        if (!placeId || !label) return null;
        return { id: `google:${placeId}`, label };
      })
      .filter(Boolean) as LocationOption[];

    return NextResponse.json({ options });
  } catch (e: any) {
    return NextResponse.json(
      { options: [], error: e?.message ?? "Search failed" },
      { status: 500 }
    );
  }
}
