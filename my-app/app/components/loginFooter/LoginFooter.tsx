// components/login-footer.tsx
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
    title: " ",
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
    title: " ",
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
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="mb-10 text-4xl font-extrabold tracking-tight text-gray-900">
          Hirexa
        </div>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-6">
          <div className="md:col-span-5">
            <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-5">
              {columns.map((col, idx) => (
                <div key={idx}>
                  {col.title.trim() ? (
                    <h3 className="text-sm font-semibold text-gray-900">
                      {col.title}
                    </h3>
                  ) : (
                    <div className="h-5" />
                  )}

                  <ul className="mt-4 space-y-3">
                    {col.links.map((l) => (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          className="text-sm text-gray-700 hover:text-gray-900"
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

          <div className="md:col-span-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Customer support
            </h3>
            <div className="mt-4 space-y-4 text-sm text-gray-700">
              <div className="flex items-start gap-2">
                <span className="mt-0.5">📞</span>
                <div>
                  <div className="font-medium text-gray-900">855-695-3235</div>
                  <div className="mt-1">Mon–Fri 8 AM – 8 PM CST</div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="mt-0.5">🗓️</span>
                <div>
                  <div className="font-medium text-gray-900">
                    Sat 8 AM – 5 PM CST
                  </div>
                  <div className="mt-1">Sun 10 AM – 6 PM CST</div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="mt-0.5">✉️</span>
                <div>
                  <a
                    className="font-medium text-gray-900 hover:underline"
                    href="mailto:customersupport@Hirexa.ai"
                  >
                    customersupport@Hirexa.ai
                  </a>
                </div>
              </div>

              <Link
                href="/contact"
                className="inline-flex text-sm font-medium text-blue-700 hover:text-blue-800"
              >
                Contact us
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-12 text-xs text-gray-600">
          © {new Date().getFullYear()}, BA Technology. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
