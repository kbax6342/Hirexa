// File: /Hirexa/my-app/components/login-footer.tsx
import Link from "next/link";
import { FooterTrustRow } from "../footer-trust-row";

const columns: Array<{
  title: string;
  links: Array<{ label: string; href: string }>;
}> = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/how-it-works" },
      { label: "Help Center", href: "/help-center" },
      { label: "Billing & Credits", href: "/billing-and-credits" },
      { label: "Fraud Awareness", href: "/fraud-awareness" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "AI Use Disclosure", href: "/ai-disclosure" },
      { label: "Do not sell or share my information", href: "/do-not-sell" },
      { label: "Accessibility", href: "/accessibility" },
    ],
  },
];

export default function LoginFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto w-full max-w-7xl px-6 py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          {/* Brand */}
          <div className="lg:col-span-4">
            <Link href="/" className="inline-flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-sm">
                <span className="text-sm font-bold text-primary-foreground">
                  H
                </span>
              </div>

              <div>
                <span className="font-heading text-lg font-bold tracking-tight text-foreground">
                  Hirexa <span className="text-accent">AI</span>
                </span>
              </div>
            </Link>

            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              Intelligent job search automation designed to help candidates move
              faster with smarter tools for resumes, applications, and career
              support.
            </p>
          </div>

          {/* Navigation */}
          <div className="lg:col-span-5">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
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

          {/* Customer Support */}
          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-border bg-muted/30 p-5">
              <h3 className="text-sm font-semibold text-foreground">
                Customer Support
              </h3>

              <div className="mt-4 space-y-4 text-sm text-muted-foreground">
                <p className="leading-6">
                  Need help or have questions about Hirexa AI? Reach out and
                  we’ll point you in the right direction.
                </p>

                <a
                  href="mailto:support@hirexa-ai.com"
                  className="block font-medium text-foreground transition-colors hover:text-primary hover:underline"
                >
                  support@hirexa-ai.com
                </a>

                <Link
                  href="/contact-us"
                  className="inline-flex items-center font-medium text-primary transition-colors hover:text-primary/90"
                >
                  Contact us →
                </Link>
              </div>
            </div>
          </div>
        </div>

        <FooterTrustRow />

        {/* Bottom bar */}
        <div className="mt-8 flex gap-3 border-t border-border pt-6 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
         
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Hirexa AI. All rights reserved.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">BA Technology</p>
          

          {/* <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 sm:justify-end">
            <Link
              href="/privacy"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <Link
              href="/accessibility"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Accessibility
            </Link>
          </div> */}
        </div>
      </div>
    </footer>
  );
}
