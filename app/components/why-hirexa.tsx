import { Check } from "lucide-react"

const benefits = [
  "Less time applying",
  "Better-matched opportunities",
  "Stronger applications",
  "Clear progress tracking",
]

const steps = [
  {
    step: "01",
    title: "Create your profile",
    desc: "Add your skills, experience, and preferences once.",
  },
  {
    step: "02",
    title: "Get matched automatically",
    desc: "We scan listings and surface roles that fit you.",
  },
  {
    step: "03",
    title: "Apply with one click",
    desc: "Auto-fill applications and submit in seconds.",
  },
  {
    step: "04",
    title: "Track everything",
    desc: "Monitor status, follow up, and stay organized.",
  },
]

export function WhyHirexa() {
  return (
    <section id="how-it-works" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              Why Hirexa
            </p>
            <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
              Job searching wasn{"'"}t built for today. We fixed that.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Applying for jobs shouldn{"'"}t feel like a second full-time job.
              Hirexa AI streamlines the entire process.
            </p>

            <ul className="mt-8 flex flex-col gap-4" role="list">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-foreground">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 md:p-10">
            <div className="flex flex-col gap-6">
              {steps.map((item) => (
                <div key={item.step} className="flex gap-5">
                  <span className="font-heading text-2xl font-bold text-primary/30">
                    {item.step}
                  </span>
                  <div>
                    <h3 className="font-medium text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
