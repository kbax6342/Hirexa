import { redirect } from "next/navigation";

import { QUESTIONS_CLIENTS_ROUTE } from "@/app/lib/onboarding-flow";

export default function QuestionsPage() {
  redirect(QUESTIONS_CLIENTS_ROUTE);
}
