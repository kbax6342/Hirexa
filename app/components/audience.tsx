import { Briefcase, RefreshCw, GraduationCap, Clock } from "lucide-react"

const personas = [
  {
    icon: Briefcase,
    label: "Job seekers applying to multiple roles",
  },
  {
    icon: RefreshCw,
    label: "Career switchers and return-to-work professionals",
  },
  {
    icon: GraduationCap,
    label: "Graduates and early-career candidates",
  },
  {
    icon: Clock,
    label: "Anyone tired of manual applications",
  },
]

export function Audience() {
  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Who It{"'"}s For
          </p>
          <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
            Designed for every job seeker
          </h2>
        </div>

        <div className="mx-auto mt-14 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          {personas.map((persona) => {
            const Icon = persona.icon
            return (
              <div
                key={persona.label}
                className="flex items-center gap-4 rounded-xl border border-border bg-card px-6 py-5 transition-all hover:border-primary/30 hover:bg-secondary/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-foreground">
                  {persona.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
