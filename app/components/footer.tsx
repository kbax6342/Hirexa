export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div>
            <a
              href="#"
              className="flex items-center gap-2"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-xs font-bold text-primary-foreground">H</span>
              </div>
              <span className="font-heading text-lg font-bold tracking-tight text-foreground">
                Hirexa <span className="text-accent">AI</span>
              </span>
            </a>
            <p className="mt-2 text-sm text-muted-foreground">
              Intelligent job search automation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            {[
              { label: "Features", href: "#features" },
              { label: "How It Works", href: "/how-it-works" },
              { label: "Find Jobs", href: "/jobs" },
              { label: "Job Locations", href: "/locations" },
              { label: "Privacy", href: "/privacy/" },
              { label: "Terms", href: "/terms/" },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Hirexa AI. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
