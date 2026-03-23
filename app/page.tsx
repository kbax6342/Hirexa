import { auth } from "../auth";
import { redirect } from "next/navigation";
import { Navbar } from "./components/navbar"
import { Hero } from "./components/hero"
import { WhyHirexa } from "./components/why-hirexa"
import { Features } from "./components/features"
import { HirePilotWorksEverywhere } from "./components/hirepilot-works-everywhere"
import { ComingSoon } from "./components/coming-soon"
import { Trust } from "./components/trust"
import { Audience } from "./components/audience"
import { CTA } from "./components/cta"
import { Footer } from "./components/footer"
import { getOnboardingStatusForUser } from "./lib/onboarding/status";

export default async function Home() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (userId) {
    const onboarding = await getOnboardingStatusForUser(userId);
    if (!onboarding.completed && onboarding.nextPath) {
      redirect(onboarding.nextPath);
    }
  }

  const href = session?.user ? "/dashboard" : "/resume";

  return (
    <>
    <Navbar />
    <main>
      <Hero href={href} />
      <WhyHirexa />
      <Features />
      <HirePilotWorksEverywhere />
      <ComingSoon />
      <Trust />
      <Audience />
      <CTA href={href} />
    </main>
    <Footer />
  </>
  );
}
