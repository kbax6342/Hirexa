import { Shield, Eye, Layers, Heart } from "lucide-react"

const principles = [
  {
    icon: Layers,
    title: "No unnecessary complexity",
    desc: "Clean, intuitive tools that just work.",
  },
  {
    icon: Eye,
    title: "Transparent pricing",
    desc: "No hidden fees or surprise charges.",
  },
  {
    icon: Shield,
    title: "Secure user data",
    desc: "Your information is protected at every level.",
  },
  {
    icon: Heart,
    title: "Human-centered design",
    desc: "Built for real people, not just algorithms.",
  },
]

export function Trust() {
  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-10 md:p-16">
          {/* Subtle glow */}
          <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-64 w-[500px] rounded-full bg-primary/8 blur-[100px]" />

          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
              Built for Real People, Not Just Algorithms
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Hirexa is designed with clarity, privacy, and ease-of-use in mind.
              We focus on helping you move forward, not locking you into endless
              steps.
            </p>
          </div>

          <div className="relative mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {principles.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5 text-sky-600" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
