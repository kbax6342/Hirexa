import Link from "next/link";
import { FooterTrustRow } from "./footer-trust-row";

const footerLinks = [

  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Blog", href: "/blog" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Newsletter", href: "/newsletter" },
  { label: "Find Jobs", href: "/jobs" },
  { label: "Job Locations", href: "/locations" },
  { label: "Privacy", href: "/privacy/" },
  { label: "Terms", href: "/terms/" },
];

export function Footer() {
  return (
    <footer className="border-t border-white/8 bg-[#050a14]/85">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 md:py-12">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="text-center md:text-left">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-white/10 bg-sky-500/90 shadow-[0_12px_28px_-18px_rgba(14,165,233,0.85)]">
                <span className="text-xs font-bold text-white">H</span>
              </div>
              <span className="font-heading text-lg font-bold tracking-tight text-white">
                Hirexa <span className="text-sky-400">AI</span>
              </span>
            </Link>
            <p className="mt-2 text-sm text-slate-400">
              Smarter job matching, applications, and career support in one place.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-center sm:flex sm:flex-wrap sm:items-center sm:justify-center md:justify-end">
            {footerLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-xs text-slate-400 transition-colors hover:text-white sm:text-sm"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-6 text-center">
          <FooterTrustRow />
          <p className="mt-4 text-xs text-slate-500 sm:text-sm">
            &copy; {new Date().getFullYear()} Hirexa AI. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
