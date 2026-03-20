import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Footer } from "@/app/components/footer";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";

import type {
  MarketingPageContent,
  MarketingPageCta,
} from "./marketingContent";

function MarketingPageButton({ cta }: { cta: MarketingPageCta }) {
  if (cta.variant === "secondary") {
    return (
      <Button
        asChild
        variant="outline"
        className="rounded-full border-white/25 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15 hover:text-white"
      >
        <Link href={cta.href}>{cta.label}</Link>
      </Button>
    );
  }

  return (
    <Button
      asChild
      className="rounded-full bg-white px-5 text-sm font-semibold text-sky-700 hover:bg-sky-50"
    >
      <Link href={cta.href}>
        {cta.label}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}

export default function MarketingPageShell({
  page,
}: {
  page: MarketingPageContent;
}) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-sky-600 via-sky-500 to-cyan-500 px-6 py-12 text-white sm:px-10">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-100">
              {page.hero.eyebrow}
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
              {page.hero.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-sky-50 sm:text-lg">
              {page.hero.description}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {page.hero.ctas.map((cta) => (
                <MarketingPageButton key={`${cta.href}-${cta.label}`} cta={cta} />
              ))}
            </div>
          </div>

          {page.hero.stats?.length ? (
            <div className="grid gap-4 border-t border-slate-200 px-6 py-6 sm:grid-cols-3 sm:px-10">
              {page.hero.stats.map((stat) => (
                <div
                  key={`${stat.value}-${stat.label}`}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
                >
                  <div className="text-2xl font-semibold tracking-tight text-slate-900">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">{stat.label}</div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {page.sections.map((section) => (
          <section key={section.title} className="mt-10">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
                {section.title}
              </h2>
              {section.description ? (
                <p className="mt-3 text-base leading-7 text-slate-600">
                  {section.description}
                </p>
              ) : null}
            </div>

            <div
              className={cn(
                "mt-6 grid gap-6",
                section.columns === 2
                  ? "lg:grid-cols-2"
                  : "md:grid-cols-2 lg:grid-cols-3"
              )}
            >
              {section.items.map((item) => (
                <article
                  key={item.title}
                  className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                      <item.icon className="h-5 w-5" />
                    </div>
                    {item.badge ? (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                        {item.badge}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-5 text-lg font-semibold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {item.description}
                  </p>

                  {item.bullets?.length ? (
                    <ul className="mt-5 space-y-2 text-sm text-slate-600">
                      {item.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ))}

        <section className="mt-10 overflow-hidden rounded-[32px] border border-slate-900 bg-slate-900 text-white shadow-sm">
          <div className="px-6 py-10 sm:px-10">
            <h2 className="text-3xl font-semibold tracking-tight">
              {page.closing.title}
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-white/75">
              {page.closing.description}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {page.closing.ctas.map((cta) => (
                <Button
                  key={`${cta.href}-${cta.label}`}
                  asChild
                  variant={cta.variant === "secondary" ? "outline" : "default"}
                  className={
                    cta.variant === "secondary"
                      ? "rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                      : "rounded-full bg-sky-500 text-white hover:bg-sky-400"
                  }
                >
                  <Link href={cta.href}>{cta.label}</Link>
                </Button>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
