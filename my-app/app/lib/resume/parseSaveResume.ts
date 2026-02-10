type Experience = {
    id: string;
    title: string;
    company: string;
    location?: string;
    dateRange?: string;
    bullets: string[];
  };
  
  export async function parseSavedResumeToExperiences(args: {
    resumeId: string;
    profileId: string;
  }): Promise<Experience[]> {
    const { resumeId } = args;
  
    // TODO:
    // 1) Load the resume file bytes/text by resumeId
    // 2) Run your existing LLM parsing prompt/logic
    // 3) Return normalized Experience[]
  
    // Placeholder so TS compiles:
    return [
      {
        id: `exp_${resumeId}_1`,
        title: "Example Title",
        company: "Example Company",
        location: "Example City, ST",
        dateRange: "2022 – 2024",
        bullets: ["Replace this with your real LLM output bullets."],
      },
    ];
  }
  