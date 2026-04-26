import { NextResponse } from "next/server";
import { normalizeStateInput } from "@/app/lib/locationOptions";

export const runtime = "nodejs";

type GooglePlacePrediction = {
  placeId?: string;
  text?: { text?: string };
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
};

type GooglePlacesAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: GooglePlacePrediction;
  }>;
};

type ParsedGoogleCityState = {
  label: string;
  city: string;
  state: string;
};

function buildPlacesRequestBody(
  input: string,
  primaryType: "(cities)" | "(regions)",
  sessionToken: string,
) {
  return {
    input,
    includedPrimaryTypes: [primaryType],
    includedRegionCodes: ["us"],
    regionCode: "us",
    languageCode: "en",
    sessionToken,
  };
}

function stripCountrySuffix(value: string) {
  return value
    .replace(/,\s*(usa|united states)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCityStateFromGoogleText(
  value: string,
): ParsedGoogleCityState | null {
  const cleaned = stripCountrySuffix(value);
  if (!cleaned) {
    return null;
  }

  const commaParts = cleaned
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (commaParts.length === 1) {
    const matchedState = normalizeStateInput(commaParts[0]);
    if (!matchedState) {
      return null;
    }

    return {
      label: matchedState.name,
      city: "",
      state: matchedState.code,
    };
  }

  for (let index = commaParts.length - 1; index >= 1; index -= 1) {
    const matchedState = normalizeStateInput(commaParts[index]);
    const city = commaParts.slice(0, index).join(", ").trim();
    if (!matchedState || !city) {
      continue;
    }

    return {
      label: `${city}, ${matchedState.code}`,
      city,
      state: matchedState.code,
    };
  }

  const wordParts = cleaned.split(/\s+/).filter(Boolean);
  for (let size = Math.min(3, wordParts.length - 1); size >= 1; size -= 1) {
    const stateCandidate = wordParts.slice(-size).join(" ");
    const matchedState = normalizeStateInput(stateCandidate);
    const city = wordParts.slice(0, -size).join(" ").trim();
    if (!matchedState || !city) {
      continue;
    }

    return {
      label: `${city}, ${matchedState.code}`,
      city,
      state: matchedState.code,
    };
  }

  return null;
}

function readPredictionText(prediction: GooglePlacePrediction) {
  const mainText = prediction.structuredFormat?.mainText?.text?.trim() ?? "";
  const secondaryText =
    prediction.structuredFormat?.secondaryText?.text?.trim() ?? "";
  const fullText = prediction.text?.text?.trim() ?? "";

  return [mainText, secondaryText].filter(Boolean).join(", ") || fullText;
}

function mapGoogleSuggestions(payload: GooglePlacesAutocompleteResponse) {
  return (payload.suggestions ?? [])
    .map((suggestion) => {
      const prediction = suggestion.placePrediction;
      if (!prediction) {
        return null;
      }

      const parsed = parseCityStateFromGoogleText(readPredictionText(prediction));
      if (!parsed) {
        return null;
      }

      return {
        label: parsed.label,
        city: parsed.city,
        state: parsed.state,
        source: "google" as const,
        placeId: prediction.placeId ?? null,
      };
    })
    .filter(
      (
        suggestion,
      ): suggestion is {
        label: string;
        city: string;
        state: string;
        source: "google";
        placeId: string | null;
      } => Boolean(suggestion),
    );
}

function dedupeSuggestions(
  suggestions: Array<{
    label: string;
    city: string;
    state: string;
    source: "google";
    placeId: string | null;
  }>,
) {
  const seen = new Set<string>();

  return suggestions.filter((suggestion) => {
    const key = suggestion.label.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function fetchPlacesAutocomplete(args: {
  apiKey: string;
  input: string;
  primaryType: "(cities)" | "(regions)";
  sessionToken: string;
}) {
  const response = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": args.apiKey,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
      },
      body: JSON.stringify(
        buildPlacesRequestBody(args.input, args.primaryType, args.sessionToken),
      ),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.warn("[locations autocomplete] Google Places request failed", {
      primaryType: args.primaryType,
      status: response.status,
      bodySnippet: errorText.slice(0, 240),
    });
    return [] as Array<{
      label: string;
      city: string;
      state: string;
      source: "google";
      placeId: string | null;
    }>;
  }

  const payload =
    (await response.json().catch(() => null)) as GooglePlacesAutocompleteResponse | null;
  if (!payload) {
    return [];
  }

  return mapGoogleSuggestions(payload);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const apiKey =
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    "";

  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      suggestions: [],
      source: "disabled",
    });
  }

  if (query.length < 2) {
    return NextResponse.json({
      ok: true,
      suggestions: [],
      source: "google",
    });
  }

  const sessionToken = crypto.randomUUID();

  try {
    const [citySuggestions, regionSuggestions] = await Promise.all([
      fetchPlacesAutocomplete({
        apiKey,
        input: query,
        primaryType: "(cities)",
        sessionToken,
      }),
      fetchPlacesAutocomplete({
        apiKey,
        input: query,
        primaryType: "(regions)",
        sessionToken,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      suggestions: dedupeSuggestions([
        ...citySuggestions,
        ...regionSuggestions,
      ]).slice(0, 8),
      source: "google",
    });
  } catch (error) {
    console.warn("[locations autocomplete] Google Places autocomplete errored", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json({
      ok: true,
      suggestions: [],
      source: "google",
    });
  }
}
