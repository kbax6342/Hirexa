import { Mic, MapPin } from "lucide-react"
import { Badge } from "../components/ui/badge"

const upcoming = [
  {
    icon: Mic,
    title: "Interview Buddy",
    description:
      "Practice smarter with guided interview prep and real-time feedback.",
    bullets: [
      "Role-specific interview questions",
      "Confidence-building responses",
      "Practice at your own pace",
    ],
  },
  {
    icon: MapPin,
    title: "Job Fairs & Hiring Events",
    description:
      "Discover local and national job fairs — virtual and in-person — all in one place.",
    bullets: [
      "Curated hiring events",
      "Easy discovery by location or industry",
      "Never miss an opportunity",
    ],
  },
]

export function ComingSoon() {
  return (
    <section id="coming-soon" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Badge
            variant="outline"
            className="mb-4 border-primary/30 text-sky-600 bg-primary/5 px-3 py-1 text-xs font-medium"
          >
            Coming Soon
          </Badge>
          <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
            Built With Purpose
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            We{"'"}re building new tools to help you at every stage — here{"'"}s
            what{"'"}s next on the roadmap.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-8 md:grid-cols-2">
          {upcoming.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.title}
                className="relative rounded-2xl border border-dashed border-primary/20 bg-primary/[0.02] p-8"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5 text-sky-600" />
                </div>
                <h3 className="mt-5 font-heading text-lg font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
                <ul className="mt-5 flex flex-col gap-2.5" role="list">
                  {item.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/30" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
