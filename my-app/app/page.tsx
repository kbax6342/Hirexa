import Image from "next/image";
import Link from "next/link";
import {auth} from "../auth"
import { startOnboarding } from "../app/api/actions/startOnboarding";
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
  
    // const router = useRouter();
  
    // const handleGetStarted = async () => {
    //   // create guest user + profile
    //   await fetch("/api/onboarding/start", { method: "POST" });
  
    //   router.push("/questions/step2");
    // };
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
