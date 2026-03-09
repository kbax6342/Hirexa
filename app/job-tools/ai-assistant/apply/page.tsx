import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AiAssistantApplyPage({ searchParams }: Props) {
  const params = await searchParams;
  const jobUrl = typeof params.jobUrl === "string" ? params.jobUrl.trim() : "";

  redirect(`/job-tools/generate${jobUrl ? `?jobUrl=${encodeURIComponent(jobUrl)}` : ""}`);
}
