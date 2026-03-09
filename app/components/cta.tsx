import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { auth } from "@/auth";

import { Button } from "../components/ui/button";

export async function CTA() {
  const session = await auth();
  const href = session?.user ? "/dashboard" : "/onboarding/resume";

  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-primary/12 blur-[80px]" />
          <div className="pointer-events-none absolute -bottom-16 left-1/4 h-32 w-64 rounded-full bg-accent/8 blur-[60px]" />

          <div className="relative px-8 py-20 text-center md:px-16">
            <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground text-balance sm:text-4xl md:text-5xl">
              Ready to take control of your job search?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Join Hirexa and start applying smarter - not harder.
            </p>
            <div className="mt-10">
              <Button
                asChild
                size="lg"
                className="h-13 rounded-full bg-primary px-10 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
              >
                <Link href={href}>
                  Get Started Today
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
