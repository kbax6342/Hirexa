import { requirePaidAccess } from "@/app/lib/access";
import { Navbar } from "./components/navbar";
import { Hero } from "./components/hero";
import { WhyHirexa } from "./components/why-hirexa";
import { Features } from "./components/features";
import { ComingSoon } from "./components/coming-soon";
import { Trust } from "./components/trust";
import { Audience } from "./components/audience";
import { CTA } from "./components/cta";
import { Footer } from "./components/footer";

export default async function Home() {
  await requirePaidAccess("/");

  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <WhyHirexa />
        <Features />
        <ComingSoon />
        <Trust />
        <Audience />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
