import {
  Search,
  Zap,
  FileText,
  PenTool,
  MessageSquare,
  Bot,
} from "lucide-react"



const features = [
  {
    icon: Search,
    title: "Smart Job Discovery",
    description:
      "Find the right opportunities faster with AI-powered job matching tailored to your skills, experience, and preferences.",
    bullets: [
      "Personalized job recommendations",
      "Matches based on your experience and skills",
      "Remote and location-based filtering",
    ],
  },
  {
    icon: Zap,
    title: "AI Job Auto Apply",
    description:
      "Let Hirexa automatically submit job applications for you so you can focus on interviews instead of repetitive forms.",
    bullets: [
      "Automatically applies to matching jobs",
      "Uses your saved resume and profile",
      "Submit more applications effortlessly",
    ],
  },
  {
    icon: FileText,
    title: "Resume Optimization",
    description:
      "Improve your resume with AI-powered insights designed to pass ATS systems and impress recruiters.",
    bullets: [
      "AI resume improvement suggestions",
      "Keyword optimization for job descriptions",
      "Role-specific resume tailoring",
    ],
  },
  {
    icon: PenTool,
    title: "AI Cover Letter Generator",
    description:
      "Generate professional cover letters tailored to every job posting in seconds.",
    bullets: [
      "Personalized for each job",
      "Natural, professional language",
      "Generated instantly",
    ],
  },
  {
    icon: MessageSquare,
    title: "Recruiter Outreach Automation",
    description:
      "Connect with recruiters and hiring managers automatically using AI-powered outreach.",
    bullets: [
      "AI-generated LinkedIn outreach",
      "Expand your professional network",
      "Discover hidden job opportunities",
    ],
  },
  {
    icon: Bot,
    title: "AI Career Coach",
    description:
      "Get guidance from an AI assistant designed to help you land more interviews and job offers.",
    bullets: [
      "Career advice and job search strategy",
      "Resume and profile feedback",
      "Interview preparation support",
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
