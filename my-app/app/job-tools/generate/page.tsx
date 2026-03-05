import { requirePaidAccess } from "@/app/lib/access";
import JobToolsGenerateClientPage from "./JobToolsGenerateClientPage";

export default async function JobToolsGeneratePage() {
  await requirePaidAccess("/job-tools/generate");
  return <JobToolsGenerateClientPage />;
}
