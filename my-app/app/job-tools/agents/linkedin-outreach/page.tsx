import { requirePaidAccess } from "@/app/lib/access";
import LinkedInOutreachClient from "./LinkedInOutreachClient";

export default async function LinkedInOutreachPage() {
  await requirePaidAccess("/job-tools/agents/linkedin-outreach");
  return <LinkedInOutreachClient />;
}
