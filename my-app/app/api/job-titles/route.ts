// app/api/job-titles/route.ts
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // Make sure you set this in your .env
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";

    if (!q) return NextResponse.json([]);

    // Prompt Claude to return a JSON array of job titles
    const prompt = `
Given the user input "${q}", return a JSON array of up to 10 related job titles.
Only output a valid JSON array of strings, no extra text.
`;

    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.0,
      max_tokens: 1000, // Adjust as needed
    });

    //console.log(response)

    // Claude returns text in response.completion
    const text = response.content[0].text || "[]";

    console.log(text)

    let jobs: string[] = [];
    try {
      jobs = JSON.parse(text);
    } catch (err) {
      console.error("Failed to parse Claude response:", text);
    }

    // Return as objects with uuid (using index for simplicity)
    const result = jobs.map((title, idx) => ({ uuid: idx.toString(), title }));

    console.log(result);

    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json([], { status: 500 });
  }
}
