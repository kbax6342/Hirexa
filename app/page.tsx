import { auth } from "../auth";
import { Navbar } from "./components/navbar"
import { Hero } from "./components/hero"
import { WhyHirexa } from "./components/why-hirexa"
import { Features } from "./components/features"
import { ComingSoon } from "./components/coming-soon"
import { Trust } from "./components/trust"
import { Audience } from "./components/audience"
import { CTA } from "./components/cta"
import { Footer } from "./components/footer"

export default async function Home() {
  const session = await auth();
  const href = session?.user ? "/dashboard" : "/onboarding/resume";

  return (
    <>
    <Navbar />
    <main>
      <Hero href={href} />
      <WhyHirexa />
      <Features />
      <ComingSoon />
      <Trust />
      <Audience />
      <CTA href={href} />
    </main>
    <Footer />
  </>
  );
}
