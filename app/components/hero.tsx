"use client"

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

import { Button } from "../components/ui/button";

const jobCards = [
  {
    company: "Amazon",
    abbr: "a",
    bgColor: "bg-[#232f3e]",
    textColor: "text-[#ff9900]",
    role: "Customer Success Manager",
  },
  {
    company: "IBM",
    abbr: "IBM",
    bgColor: "bg-[#0f62fe]",
    textColor: "text-foreground",
    role: "Data Scientist",
  },
  {
    company: "Uber",
    abbr: "Uber",
    bgColor: "bg-[#000000]",
    textColor: "text-foreground",
    role: "Marketing Specialist",
  },
  {
    company: "Shopify",
    abbr: "S",
    bgColor: "bg-[#96bf48]",
    textColor: "text-foreground",
    role: "Product Designer",
  },
];

export function Hero({ href }: { href: string }) {
  const router = useRouter();

  async function handleGetStarted(event: React.MouseEvent<HTMLAnchorElement>) {
    if (href === "/dashboard") {
      return;
    }

    event.preventDefault();

    try {
      await fetch("/api/onboarding/start", {
        method: "POST",
        cache: "no-store",
      });
    } catch {
      // The profile page will retry guest bootstrap if this request fails.
    }

    router.push(href);
  }

  return (
    <section className="relative overflow-hidden pb-20 pt-28 md:pb-32 md:pt-40">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/3 top-1/4 h-[500px] w-[600px] rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 h-[400px] w-[500px] rounded-full bg-accent/6 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h1 className="font-heading text-4xl font-bold leading-[1.1] tracking-tight text-foreground text-balance sm:text-5xl md:text-5xl">
              Stop Searching Harder{" "}
            </h1>
            <span className="text-accent text-sky-500 text-4xl">
              Start applying smarter.
            </span>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-white text-muted-foreground">
              Hirexa AI helps you find relevant jobs, improve your application
              materials, and dominate your interview with invisible real-time
              support.
            </p>

            <div className="mt-10">
              <Button
                asChild
                size="lg"
                className="h-12 w-full rounded-full bg-sky-500 px-8 text-base font-bold text-white shadow-lg shadow-sky-500/25 transition-all duration-200 active:scale-[0.97] motion-safe:animate-pulse hover:bg-sky-400 sm:w-auto sm:font-semibold sm:motion-safe:animate-none"
              >
                <Link href={href} onClick={handleGetStarted}>
                  <span className="sm:hidden uppercase tracking-[0.08em]">Start Free Today</span>
                  <span className="hidden sm:inline">Get Started</span>
                  <ArrowRight className="ml-2 hidden h-4 w-4 transition-transform group-hover:translate-x-0.5 sm:inline-block" />
                </Link>
              </Button>
              <div className="w-full text-center mt-1">
              {/* <span className="ml-4  text-white  text-sm text-muted-foreground">No credit card required 7-day Free Trial</span> */}
              </div>
             
            </div>

            <div className="mt-12 hidden flex-wrap items-center gap-8 sm:flex">
              {[
                { value: "10x", label: "More applications" },
                { value: "85%", label: "Match accuracy" },
                { value: "3 min", label: "Onboarding time" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="font-heading text-2xl font-bold text-foreground">
                    {stat.value}
                  </p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="relative mx-auto w-full max-w-md">
              <div className="relative rounded-2xl border border-border/50 bg-secondary/30 p-8 backdrop-blur-sm">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5" />
                <div className="relative flex flex-col gap-4">
                  {jobCards.map((card) => (
                    <div
                      key={card.role}
                      className="flex items-center gap-4 rounded-xl border border-border/30 bg-card/90 px-5 py-4 shadow-lg backdrop-blur-sm transition-transform hover:-translate-y-0.5"
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.bgColor}`}
                      >
                        <span className={`text-xs font-bold ${card.textColor}`}>
                          {card.abbr}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          {card.role}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <Check className="h-3.5 w-3.5 text-accent" />
                          <span className="text-xs text-accent">Applied</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32">
        <svg
          viewBox="0 0 1440 120"
          fill="none"
          className="absolute bottom-0 w-full"
          preserveAspectRatio="none"
        >
          <path
            d="M0 60C240 20 480 100 720 60C960 20 1200 100 1440 60V120H0V60Z"
            fill="hsl(230 55% 6%)"
            fillOpacity="0.5"
          />
          <path
            d="M0 80C360 40 720 110 1080 70C1260 50 1380 90 1440 80V120H0V80Z"
            stroke="hsl(210 100% 56%)"
            strokeOpacity="0.15"
            strokeWidth="1"
            fill="none"
          />
        </svg>
      </div>
    </section>
  );
}
