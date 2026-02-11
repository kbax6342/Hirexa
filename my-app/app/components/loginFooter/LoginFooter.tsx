// File: /Hirexa/my-app/components/login-footer.tsx
import Link from "next/link";

const columns: Array<{
  title: string;
  links: Array<{ label: string; href: string }>;
}> = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/how-it-works" },
      { label: "Fraud Awareness", href: "/fraud-awareness" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Terms & Conditions", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "CCPA/GDPR", href: "/ccpa-gdpr" },
      { label: "Do not sell or share my information", href: "/do-not-sell" },
      { label: "Accessibility", href: "/accessibility" },
    ],
  },
  {
    title: "Job Categories",
    links: [
      { label: "All Job Categories", href: "/jobs/categories" },
      { label: "Accounting Jobs", href: "/jobs/accounting" },
      { label: "Customer Service Jobs", href: "/jobs/customer-service" },
      { label: "Data Science Jobs", href: "/jobs/data-science" },
      { label: "Graphic Design Jobs", href: "/jobs/graphic-design" },
      { label: "Healthcare Jobs", href: "/jobs/healthcare" },
    ],
  },
  {
    title: "More",
    links: [
      { label: "Legal Jobs", href: "/jobs/legal" },
      { label: "Marketing Jobs", href: "/jobs/marketing" },
      { label: "Nursing Jobs", href: "/jobs/nursing" },
      { label: "Project Manager Jobs", href: "/jobs/project-manager" },
      { label: "QA Jobs", href: "/jobs/qa" },
      { label: "Sales Jobs", href: "/jobs/sales" },
    ],
  },
  {
    title: "Locations",
    links: [
      { label: "Social Media Jobs", href: "/jobs/social-media" },
      { label: "Teaching Jobs", href: "/jobs/teaching" },
      { label: "Trade Jobs", href: "/jobs/trades" },
      { label: "UX Design Jobs", href: "/jobs/ux-design" },
      { label: "Writing Jobs", href: "/jobs/writing" },
      { label: "All Job Locations", href: "/jobs/locations" },
    ],
  },
];

export default function LoginFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto w-full max-w-7xl px-6 py-12">
        {/* Top: Brand + columns + support */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          {/* Brand (matches homepage footer) */}
          <div className="lg:col-span-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-xs font-bold text-primary-foreground">
                  H
                </span>
              </div>
              <span className="font-heading text-lg font-bold tracking-tight text-foreground">
                Hirexa <span className="text-accent">AI</span>
              </span>
            </Link>

            <p className="mt-2 text-sm text-muted-foreground">
              Intelligent job search automation.
            </p>
          </div>

          {/* Columns */}
          <div className="lg:col-span-7">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
              {columns.map((col) => (
                <div key={col.title}>
                  <h3 className="text-sm font-semibold text-foreground">
                    {col.title}
                  </h3>

                  <ul className="mt-4 space-y-3">
                    {col.links.map((l) => (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Customer support */}
          <div className="lg:col-span-2">
            <h3 className="text-sm font-semibold text-foreground">
              Customer support
            </h3>

            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <div>
                <div className="text-foreground font-medium">(855) 965-3235</div>
                <div className="mt-1">Mon–Fri 8AM–8PM CST</div>
              </div>

              <div>
                <div>Sat 8AM–5PM CST</div>
                <div>Sun 10AM–6PM CST</div>
              </div>

              <a
                className="inline-flex font-medium text-foreground hover:underline"
                href="mailto:customersupport@Hirexa.ai"
              >
                customersupport@Hirexa.ai
              </a>

              <Link
                href="/contact"
                className="inline-flex text-sm font-medium text-primary hover:text-primary/90"
              >
                Contact us
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom bar (matches homepage footer) */}
        <div className="mt-8 border-t border-border pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Hirexa AI. All rights reserved.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            BA Technology
          </p>
        </div>
      </div>
    </footer>
  );
}
