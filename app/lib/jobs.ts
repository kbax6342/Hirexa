// lib/jobs.ts
export type Job = {
  uuid: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  jobUrl: string;
  logoText: string;
  pill?: string;
};

export async function getJobById(id: string): Promise<Job | null> {
  // TODO: Replace with real lookup (DB, external API, etc.)
  // For now: return null or mock
  return null;
}
