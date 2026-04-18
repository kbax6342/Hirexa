import "server-only";

import OpenAI from "openai";

import {
  normalizeRecruiterStage,
  type RecruiterStage,
} from "@/app/lib/recruiter/constants";

type RecruiterMessageContext = {
  candidate: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    headline?: string | null;
    location?: string | null;
    skills?: string[];
  };
  jobOrder: {
    title: string;
    companyName: string;
    location?: string | null;
    employmentType?: string | null;
    requiredSkills?: string[];
  };
  stage?: RecruiterStage | string | null;
  messageType?: string | null;
  recruiterName?: string | null;
  agencyName?: string | null;
};

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function buildCandidateName(context: RecruiterMessageContext) {
  const parts = [context.candidate.firstName, context.candidate.lastName]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" ");
  if (context.candidate.email) return context.candidate.email;
  return "there";
}

function buildMessageType(stage: RecruiterStage, requestedType?: string | null) {
  const normalized = String(requestedType ?? "")
    .trim()
    .toLowerCase();
  if (normalized) return normalized;

  switch (stage) {
    case "INTERVIEW":
      return "interview follow-up";
    case "OFFER":
      return "offer congratulations";
    case "SUBMITTED":
      return "submission update";
    default:
      return "intro outreach";
  }
}

function buildDeterministicMessage(context: RecruiterMessageContext) {
  const stage = normalizeRecruiterStage(context.stage);
  const messageType = buildMessageType(stage, context.messageType);
  const candidateName = buildCandidateName(context);
  const recruiterName = context.recruiterName?.trim() || "The Hirexa recruiting team";
  const agencyName = context.agencyName?.trim() || "Hirexa";
  const locationLine = context.jobOrder.location
    ? `The role is based in ${context.jobOrder.location}.`
    : null;
  const skillLine = context.jobOrder.requiredSkills?.length
    ? `Your background in ${context.jobOrder.requiredSkills.slice(0, 3).join(", ")} stood out for this search.`
    : null;

  switch (messageType) {
    case "screen scheduling":
      return `Hi ${candidateName},

I’m recruiting on behalf of ${context.jobOrder.companyName} for a ${context.jobOrder.title} opening, and your background looks worth a closer conversation.

I’d love to schedule a brief phone screen to compare your recent experience against the priorities for this role. ${locationLine ?? ""} ${skillLine ?? ""}

If you are open to it, send over a few windows that work for you this week.

Best,
${recruiterName}
${agencyName}`.trim();
    case "submission update":
      return `Hi ${candidateName},

Quick update on the ${context.jobOrder.title} role with ${context.jobOrder.companyName}: I’ve moved your profile into the submitted stage for client review.

I’ll keep you posted on feedback and next steps as soon as I hear back. In the meantime, feel free to send over any recent updates you’d like me to share with the hiring team.

Best,
${recruiterName}
${agencyName}`.trim();
    case "interview follow-up":
      return `Hi ${candidateName},

I wanted to follow up regarding the ${context.jobOrder.title} opportunity with ${context.jobOrder.companyName}. The team would like to move into the interview stage, and I’d be happy to coordinate next steps with you.

If you’re still interested, send over your availability and I’ll help line things up quickly.

Best,
${recruiterName}
${agencyName}`.trim();
    case "offer congratulations":
      return `Hi ${candidateName},

Great news: the ${context.jobOrder.companyName} team is ready to move forward on the ${context.jobOrder.title} opportunity.

Congratulations on reaching the offer stage. I’ll walk you through details, timing, and anything you want to clarify before you make a decision.

Best,
${recruiterName}
${agencyName}`.trim();
    default:
      return `Hi ${candidateName},

I’m reaching out about a ${context.jobOrder.title} opportunity with ${context.jobOrder.companyName}. Your experience looked aligned enough that I wanted to introduce the role directly.

${skillLine ?? "I think there may be a strong overlap between your background and what the team needs right now."}
${locationLine ? `\n\n${locationLine}` : ""}

If you’d be open to a quick conversation, I’d be glad to share more details and talk through fit.

Best,
${recruiterName}
${agencyName}`.trim();
  }
}

export async function generateRecruiterMessage(context: RecruiterMessageContext) {
  const deterministicMessage = buildDeterministicMessage(context);
  if (!openai) {
    return deterministicMessage;
  }

  try {
    const stage = normalizeRecruiterStage(context.stage);
    const messageType = buildMessageType(stage, context.messageType);
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini-2024-07-18",
      temperature: 0.4,
      max_tokens: 260,
      messages: [
        {
          role: "system",
          content:
            "You write concise, professional recruiter outreach messages. Return plain text only, no markdown, no subject line.",
        },
        {
          role: "user",
          content: `Write a ${messageType} recruiter message.

Candidate: ${buildCandidateName(context)}
Candidate headline: ${context.candidate.headline ?? "Unknown"}
Candidate location: ${context.candidate.location ?? "Unknown"}
Candidate skills: ${(context.candidate.skills ?? []).slice(0, 8).join(", ") || "Unknown"}
Job title: ${context.jobOrder.title}
Company: ${context.jobOrder.companyName}
Job location: ${context.jobOrder.location ?? "Unknown"}
Employment type: ${context.jobOrder.employmentType ?? "Unknown"}
Required skills: ${(context.jobOrder.requiredSkills ?? []).slice(0, 8).join(", ") || "Unknown"}
Recruiter name: ${context.recruiterName ?? "The Hirexa recruiting team"}
Agency: ${context.agencyName ?? "Hirexa"}

Keep it warm, specific, and under 160 words.`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    return content || deterministicMessage;
  } catch {
    return deterministicMessage;
  }
}
