import { redirect } from "next/navigation";

export default function OnboardingResumePage() {
  redirect("/questions/step2");
}
