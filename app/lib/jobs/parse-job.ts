import type { JobPretty } from "./types";

export function parseJobDescription(raw: string): JobPretty {
  return {
    highlights: [
      { label: "Security Clearance", value: "Top Secret (US Citizen)" },
      { label: "Pay Range", value: "$91,800 – $151,800" },
    ],
    sections: [
      {
        title: "Job Description",
        kind: "paragraphs",
        paragraphs: [
          "At Boeing, we innovate and collaborate...",
          "Boeing Defense, Space & Security (BDS)...",
        ],
      },
      {
        title: "Position Responsibilities",
        kind: "bullets",
        bullets: [
          "Review, develop, document, and maintain system requirements...",
          "Define test strategies and acceptance criteria...",
        ],
      },
    ],
  };
}
