import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { startOnboarding } from "@/app/api/actions/startOnboarding";
import { Button } from "../components/ui/button";

export function CTA({ href }: { href: string }) {
  const isAuthenticatedHref = href === "/dashboard";

  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.05] shadow-[0_30px_120px_-55px_rgba(14,165,233,0.55)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute -top-28 left-1/2 h-56 w-[26rem] -translate-x-1/2 rounded-full bg-primary/14 blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-20 left-1/4 h-40 w-72 rounded-full bg-accent/10 blur-[80px]" />

          <div className="relative px-8 py-20 text-center md:px-16">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-100">
              Hirexa AI
            </div>
            <h2 className="font-heading mt-5 text-3xl font-bold tracking-tight text-white text-balance sm:text-4xl md:text-5xl">
              Ready to take control of your job search?
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
              Join Hirexa and start applying smarter with AI-powered matching,
              stronger job applications, and support that stays with you through
              the full search.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              {isAuthenticatedHref ? (
                <>
                  <Button
                    asChild
                    size="lg"
                    className="h-12 rounded-full bg-sky-500 px-10 text-base font-semibold text-white shadow-[0_18px_45px_-22px_rgba(14,165,233,0.75)] hover:bg-sky-400"
                  >
                    <Link href={href}>
                      Open Dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="h-12 rounded-full border-white/12 bg-white/[0.04] px-10 text-base font-medium text-slate-100 hover:bg-white/[0.08] hover:text-white"
                  >
                    <Link href="/jobs">Browse Jobs</Link>
                  </Button>
                </>
              ) : (
                <>
                  <form action={startOnboarding}>
                    <Button
                      type="submit"
                      size="lg"
                      className="h-12 rounded-full bg-sky-500 px-10 text-base font-semibold text-white shadow-[0_18px_45px_-22px_rgba(14,165,233,0.75)] hover:bg-sky-400"
                    >
                      Get Started Today
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </form>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="h-12 rounded-full border-white/12 bg-white/[0.04] px-10 text-base font-medium text-slate-100 hover:bg-white/[0.08] hover:text-white"
                  >
                    <Link href="/jobs">Browse Jobs</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
