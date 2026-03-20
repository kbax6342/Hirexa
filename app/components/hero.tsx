"use client"

import Link from "next/link";
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
  return (
    <section className="relative overflow-hidden pb-20 pt-28 md:pb-32 md:pt-40">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/3 top-1/4 h-[500px] w-[600px] rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 h-[400px] w-[500px] rounded-full bg-accent/6 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h1 className="font-heading text-4xl font-bold leading-[1.1] tracking-tight text-foreground text-balance sm:text-5xl md:text-6xl">
              Cast a wider net{" "}
              <span className="text-muted-foreground">&mdash;</span>{" "}
              <span className="text-accent text-sky-500">10x your job applications</span>
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Our AI-powered job search automation platform continuously finds and
              applies to relevant job openings until you&apos;re hired.
            </p>

            <div className="mt-10">
              <Button
                asChild
                size="lg"
                className="bg-sky-500 text-white hover:bg-sky-400 h-12 rounded-full px-8 text-base font-semibold shadow-lg shadow-sky-500/25 transition-all duration-200 active:scale-[0.97]"
              >
                <Link href={href}>
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-8">
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
