import { NextResponse } from "next/server";
import OpenAI from "openai";

type ExperienceInput = {
  title?: string;
  company?: string;
  location?: string | null;
  dateRange?: string | null;
  bullets?: string[];
};

type ProfileInsightsRequest = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  experiences?: ExperienceInput[];
};

function safeText(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: true,
          insights: {
            majorTheme: "Generalist experience",
            majorThemeReason: "OPENAI_API_KEY missing, showing fallback summary.",
            profileStrength: "Developing",
            profileStrengthReason: "Add more profile details to unlock deeper analysis.",
          },
        },
        { status: 200 }
      );
    }

    const body = (await req.json()) as ProfileInsightsRequest;
    const experiences = Array.isArray(body.experiences) ? body.experiences.slice(0, 12) : [];

    const profileSignals = {
      firstName: safeText(body.firstName),
      lastName: safeText(body.lastName),
      email: safeText(body.email),
      phone: safeText(body.phone),
      experiences: experiences.map((exp) => ({
        title: safeText(exp.title),
        company: safeText(exp.company),
        location: safeText(exp.location),
        dateRange: safeText(exp.dateRange),
        bullets: Array.isArray(exp.bullets)
          ? exp.bullets.map((b) => safeText(b)).filter(Boolean).slice(0, 6)
          : [],
      })),
    };

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You analyze resume/profile data for a job seeker dashboard. Return strict JSON with keys: majorTheme, majorThemeReason, profileStrength, profileStrengthReason. profileStrength must be words only (e.g., Foundational, Developing, Strong, Excellent) and never include numbers or percentages.",
        },
        {
          role: "user",
          content: `Analyze this profile and resume data: ${JSON.stringify(profileSignals)}\n\nRules:\n1) majorTheme should be a concise phrase (2-5 words) describing the dominant work theme.\n2) profileStrength should be one word/short phrase level label.\n3) Reasons should be one sentence each and reference available evidence.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: {
      majorTheme?: string;
      majorThemeReason?: string;
      profileStrength?: string;
      profileStrengthReason?: string;
    } = {};

    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const majorTheme = safeText(parsed.majorTheme) || "Generalist experience";
    const majorThemeReason =
      safeText(parsed.majorThemeReason) || "Theme estimated from available resume entries.";
    const profileStrength = safeText(parsed.profileStrength) || "Developing";
    const profileStrengthReason =
      safeText(parsed.profileStrengthReason) || "Profile data is partially complete.";

    return NextResponse.json({
      ok: true,
      insights: {
        majorTheme,
        majorThemeReason,
        profileStrength,
        profileStrengthReason,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to generate profile insights";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
