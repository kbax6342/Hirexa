import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import {
  findBestApplySiteStrategyForRun,
  listApplySiteStrategiesForUser,
  recordApplySiteStrategyReplayForUser,
  saveApplySiteStrategyForUser,
} from "@/app/lib/apply/playwrightStrategyRepository";
import { generateStrategyPrompt } from "@/app/lib/ai/applyStrategyPromptGenerator";
import type {
  ApplySiteStrategyReplayUpdateInput,
  ApplySiteStrategySaveInput,
} from "@/app/lib/apply/playwrightStrategyTypes";

export const runtime = "nodejs";

async function requireUserProfileId() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { error: "Unauthorized", status: 401 } as const;
  }

  const profile = await prisma.userProfile.findFirst({
    where: { userId },
    select: { id: true },
  });

  if (!profile?.id) {
    return { error: "User profile not found.", status: 404 } as const;
  }

  return { userProfileId: profile.id } as const;
}

export async function GET(request: Request) {
  const identity = await requireUserProfileId();
  if ("error" in identity) {
    return NextResponse.json({ ok: false, error: identity.error }, { status: identity.status });
  }

  const url = new URL(request.url);
  const sourceUrl = url.searchParams.get("sourceUrl");
  const targetUrl = url.searchParams.get("targetUrl");
  const company = url.searchParams.get("company");
  const location = url.searchParams.get("location");
  const includeBestMatch =
    sourceUrl || targetUrl || company || location;
  const [strategies, bestMatch] = await Promise.all([
    listApplySiteStrategiesForUser(identity.userProfileId),
    includeBestMatch
      ? findBestApplySiteStrategyForRun({
          userProfileId: identity.userProfileId,
          sourceUrl,
          targetUrl,
          company,
          location,
        })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    ok: true,
    strategies,
    bestMatch,
  });
}

export async function POST(request: Request) {
  const identity = await requireUserProfileId();
  if ("error" in identity) {
    return NextResponse.json({ ok: false, error: identity.error }, { status: identity.status });
  }

  try {
    const input = (await request.json()) as ApplySiteStrategySaveInput;
    let strategy = await saveApplySiteStrategyForUser({
      userProfileId: identity.userProfileId,
      input,
    });
    const generatedPrompt = await generateStrategyPrompt({
      hostname: strategy.hostname,
      stoppedUrl: input.finalUrl ?? strategy.finalUrl,
      lastSavedUrl: input.finalUrl ?? strategy.finalUrl,
      observedFinalUrl:
        strategy.lastTrainedUrl ??
        strategy.rawSteps?.at(-1)?.currentUrl ??
        strategy.steps?.at(-1)?.currentUrl ??
        input.lastTrainedUrl ??
        input.steps?.at(-1)?.currentUrl,
      stopReason: input.stopReason ?? strategy.stopReason,
      lastAction: input.lastAction ?? strategy.lastAction,
      errorMessage: input.errorMessage,
      instructions: input.instructions ?? strategy.instructions,
      selectorNotes: input.selectors ?? strategy.selectors,
      replaySafeSteps: strategy.steps ?? input.steps,
      rawRecordedSteps: strategy.rawSteps ?? strategy.steps ?? input.steps,
      recordedSteps: strategy.rawSteps ?? strategy.steps ?? input.steps,
      lastTrainedUrl: strategy.lastTrainedUrl ?? input.lastTrainedUrl,
    });

    if (strategy.id) {
      await prisma.applySiteStrategy.update({
        where: { id: strategy.id },
        data: {
          derivedInstruction: generatedPrompt.aiSummary,
          automationPrompt: generatedPrompt.generatedCodexPrompt,
        },
      });
    }

    strategy = {
      ...strategy,
      derivedInstruction: generatedPrompt.aiSummary,
      automationPrompt: generatedPrompt.generatedCodexPrompt,
      aiSummary: generatedPrompt.aiSummary,
      generatedCodexPrompt: generatedPrompt.generatedCodexPrompt,
      promptGeneratedAt: generatedPrompt.promptGeneratedAt,
      promptModel: generatedPrompt.promptModel,
      promptReasoningEffort: generatedPrompt.promptReasoningEffort,
      promptWarning: generatedPrompt.promptWarning,
      promptGenerationSucceeded: Boolean(
        generatedPrompt.aiSummary && generatedPrompt.generatedCodexPrompt,
      ),
    };

    return NextResponse.json({
      ok: true,
      strategy,
      aiSummary: generatedPrompt.aiSummary,
      generatedCodexPrompt: generatedPrompt.generatedCodexPrompt,
      promptGeneratedAt: generatedPrompt.promptGeneratedAt,
      promptModel: generatedPrompt.promptModel,
      promptReasoningEffort: generatedPrompt.promptReasoningEffort,
      promptWarning: generatedPrompt.promptWarning,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save strategy.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const identity = await requireUserProfileId();
  if ("error" in identity) {
    return NextResponse.json({ ok: false, error: identity.error }, { status: identity.status });
  }

  try {
    const input = (await request.json()) as ApplySiteStrategyReplayUpdateInput;
    const strategy = await recordApplySiteStrategyReplayForUser({
      userProfileId: identity.userProfileId,
      input,
    });

    return NextResponse.json({
      ok: true,
      strategy,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update strategy replay health.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
