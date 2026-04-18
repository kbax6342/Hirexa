import { NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/app/lib/auth";
import {
  inferDeterministicProfessionalLinkLabel,
  inferProfessionalLinkLabel,
  needsAiProfessionalLinkLabel,
  normalizeProfessionalLinkUrl,
} from "@/app/lib/profile/professionalLinks";

export const runtime = "nodejs";

type InferProfessionalLinkBody = {
  url?: string;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as InferProfessionalLinkBody;
    const normalizedUrl = normalizeProfessionalLinkUrl(body.url ?? "");

    if (!normalizedUrl) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid URL." },
        { status: 400 }
      );
    }

    if (!needsAiProfessionalLinkLabel(normalizedUrl)) {
      return NextResponse.json({
        ok: true,
        label: inferDeterministicProfessionalLinkLabel(normalizedUrl),
        normalizedUrl,
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const label = await inferProfessionalLinkLabel(normalizedUrl, {
      aiFallback: apiKey
        ? async (url) => {
            const openai = new OpenAI({ apiKey });
            const completion = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              temperature: 0,
              messages: [
                {
                  role: "system",
                  content:
                    "Return only a short professional link label for a candidate profile. Use 1 to 3 words in title case.",
                },
                {
                  role: "user",
                  content: `Given this URL, return a short professional label for how it should appear on a job seeker profile. Return only the label, 1 to 3 words, title case. URL: ${url}`,
                },
              ],
            });

            return completion.choices[0]?.message?.content ?? "";
          }
        : undefined,
    });

    return NextResponse.json({
      ok: true,
      label,
      normalizedUrl,
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to infer professional link label.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
