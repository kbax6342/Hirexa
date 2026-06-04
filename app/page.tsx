import { auth } from "../auth";
import { redirect } from "next/navigation";
import { Hero } from "./components/hero"
import { WhyHirexa } from "./components/why-hirexa"
import { Features } from "./components/features"
import { HiringEventsSection } from "./components/marketing/HiringEventsSection"
import { HirePilotWorksEverywhere } from "./components/hirepilot-works-everywhere"
import { ComingSoon } from "./components/coming-soon"
import { Trust } from "./components/trust"
import { Audience } from "./components/audience"
import { CTA } from "./components/cta"
import { Footer } from "./components/footer"
import HomepageAiChatWidget from "./components/home/HomepageAiChatWidget";
import { getOnboardingStatusForUser } from "./lib/onboarding/status";
import { getHomepageAiChatCompanySettings } from "@/lib/chatbot/homepageChatbotSettings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (userId) {
    const onboarding = await getOnboardingStatusForUser(userId);
    if (!onboarding.completed && onboarding.nextPath) {
      redirect(onboarding.nextPath);
    }

    redirect("/dashboard");
  }

  const href = session?.user ? "/dashboard" : "/login";
  const homepageChatSettings = getHomepageAiChatCompanySettings();

  return (
    <>
      <main className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.16),transparent_52%),radial-gradient(circle_at_20%_24%,rgba(59,130,246,0.12),transparent_34%),radial-gradient(circle_at_78%_10%,rgba(56,189,248,0.1),transparent_30%)]" />

        <Hero href={href} />

        <div className="hidden md:block">
          <WhyHirexa />
          <Features />
          <HiringEventsSection />
          <HirePilotWorksEverywhere />
          <ComingSoon />
          <Trust />
          <Audience />
          <CTA href={href} />
        </div>
      </main>
      <div className="hidden md:block">
        <Footer />
      </div>
      <HomepageAiChatWidget companySettings={homepageChatSettings} />
    </>
  );
}
