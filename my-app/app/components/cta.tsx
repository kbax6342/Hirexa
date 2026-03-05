import { Button } from "../components/ui/button"
import { ArrowRight } from "lucide-react"
import Link from "next/link";

export function CTA() {
  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
          {/* Glows */}
          <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-96 rounded-full bg-primary/12 blur-[80px]" />
          <div className="pointer-events-none absolute -bottom-16 left-1/4 h-32 w-64 rounded-full bg-accent/8 blur-[60px]" />

          <div className="relative px-8 py-20 text-center md:px-16">
            <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl text-balance">
              Ready to take control of your job search?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Join Hirexa and start applying smarter — not harder.
            </p>
            <div className="mt-10">
            <Link href="/questions/step2">
              <Button
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-13 rounded-full px-10 text-base font-semibold shadow-lg shadow-primary/25"
              >
                Get Started Today
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
