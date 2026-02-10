import {
  Search,
  Zap,
  FileText,
  PenTool,
  Mail,
  BarChart3,
} from "lucide-react"

const features = [
  {
    icon: Search,
    title: "Smart Job Matching",
    description:
      "We continuously scan job listings and match you with roles that align with your skills, experience, and preferences.",
    bullets: [
      "Personalized role recommendations",
      "Location & remote-friendly matching",
      "Updated opportunities added regularly",
    ],
  },
  {
    icon: Zap,
    title: "Easy Apply & Auto-Fill",
    description:
      "Apply faster with intelligent auto-fill that reuses your saved profile, resume, and work history.",
    bullets: [
      "Reduce repetitive form filling",
      "Apply to more roles in less time",
      "Consistent, accurate applications",
    ],
  },
  {
    icon: FileText,
    title: "Resume Management",
    description:
      "Upload, store, and manage your resume in one place. AI-assisted improvements help tailor your resume to specific roles.",
    bullets: [
      "Secure resume storage",
      "Role-specific resume adjustments",
      "Clean, professional formatting",
    ],
  },
  {
    icon: PenTool,
    title: "AI Cover Letters",
    description:
      "Create personalized cover letters in seconds — tailored to the job description and your experience.",
    bullets: [
      "Job-specific customization",
      "Professional, human-sounding language",
      "Save time without sounding automated",
    ],
  },
  {
    icon: Mail,
    title: "Follow-Up & Outreach",
    description:
      "Stay professional and timely with structured follow-ups before and after interviews.",
    bullets: [
      "Post-application follow-up emails",
      "Interview thank-you notes",
      "Pre-interview outreach templates",
    ],
  },
  {
    icon: BarChart3,
    title: "Application Tracking",
    description:
      "Know exactly where you stand in your job search. Track applied roles and monitor application status.",
    bullets: [
      "Track applied roles",
      "Monitor application status",
      "Keep everything organized in one place",
    ],
  },
]

export function Features() {
  return (
    <section id="features" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Core Features
          </p>
          <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
            Everything you need to land the job
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            From discovery to offer, Hirexa has every stage of your job search
            covered with intelligent tools.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="group rounded-2xl border border-border bg-card p-7 transition-all hover:border-primary/30 hover:bg-secondary/50"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-heading text-lg font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
                <ul className="mt-5 flex flex-col gap-2.5" role="list">
                  {feature.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
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
