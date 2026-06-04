import type { CompanyChatbotRecord } from "@/lib/chatbot/types";

function joinList(values: string[] | undefined, fallback = "Not configured") {
  return values && values.length > 0 ? values.join(", ") : fallback;
}

export function buildCompanyPrompt(chatbot: CompanyChatbotRecord) {
  const jobs = chatbot.jobs.length
    ? chatbot.jobs
        .map((job) =>
          [
            `- ${job.title}`,
            job.location ? `  Location: ${job.location}` : null,
            job.payRange ? `  Pay: ${job.payRange}` : null,
            job.shift ? `  Shift: ${job.shift}` : null,
            job.employmentType ? `  Employment type: ${job.employmentType}` : null,
            job.requirements ? `  Requirements: ${job.requirements}` : null,
            job.description ? `  Description: ${job.description}` : null,
          ]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n")
    : "No jobs configured.";

  const questions = chatbot.questions.length
    ? chatbot.questions
        .sort((a, b) => a.order - b.order)
        .map(
          (question) =>
            `- ${question.order}. ${question.questionText} (${question.questionType}${
              question.isRequired ? ", required" : ""
            }${question.isKnockout ? ", knockout" : ""})`
        )
        .join("\n")
    : "No custom screening questions configured.";

  return `
Company chatbot setup:
- Company: ${chatbot.companyName}
- Website: ${chatbot.websiteUrl || "Not configured"}
- Industry: ${chatbot.industry || "Not configured"}
- Description: ${chatbot.companyDescription || "Not configured"}
- Locations served: ${joinList(chatbot.locationsServed)}
- Contact email: ${chatbot.mainContactEmail || "Not configured"}
- Recruiter email: ${chatbot.recruiterEmail || "Not configured"}

Jobs:
${jobs}

Required candidate fields:
${joinList(chatbot.requiredCandidateFields)}

Optional candidate fields:
${joinList(chatbot.optionalCandidateFields, "None configured")}

Screening questions:
${questions}

Qualification rules:
- Required transportation: ${chatbot.requiredTransportation || "Not configured"}
- Required work authorization: ${chatbot.requiredWorkAuthorization || "Not configured"}
- Required shift availability: ${joinList(chatbot.requiredShiftAvailability)}
- Minimum years experience: ${chatbot.minimumYearsExperience ?? "Not configured"}
- Required certifications: ${joinList(chatbot.requiredCertifications)}
- Disqualifying answers: ${joinList(chatbot.disqualifyingAnswers, "None configured")}
- Candidate score threshold: ${chatbot.candidateScoreThreshold ?? "Not configured"}

Lead routing:
- Save lead to dashboard: ${chatbot.saveLeadToDashboard ? "yes" : "no"}
- Send email notification: ${chatbot.sendEmailNotification ? "yes" : "no"}
- Webhook URL: ${chatbot.webhookUrl || "Not configured"}
- Redirect URL: ${chatbot.redirectUrl || "Not configured"}
- Completion message: ${chatbot.completionMessage || "Not configured"}
  `.trim();
}
