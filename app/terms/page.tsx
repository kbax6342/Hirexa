// File: /my-app/app/terms/page.tsx

export const metadata = {
  title: "Terms of Service | Hirexa AI",
  description: "Terms of Service for Hirexa AI",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen text-white">
      <main className="mx-auto max-w-4xl px-6 py-20">

        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-white">
            Terms of Service
          </h1>

          <p className="mt-3 text-sm text-white">
            Effective Date: March 5, 2026
          </p>
        </div>

        {/* Content */}
        <div className="space-y-10 text-white leading-relaxed">

          <section>
            <p>
              These Terms of Service ("Terms") govern your use of the Hirexa AI
              platform. By accessing or using Hirexa AI, you agree to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              1. Use of the Service
            </h2>

            <p>
              Hirexa AI provides AI-powered tools to assist users with job
              searching, resume optimization, cover letter generation, and job
              application automation.
            </p>

            <p className="mt-3">
              You agree to use the platform only for lawful purposes and in
              compliance with applicable employment platform policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              2. User Accounts
            </h2>

            <p>
              Users may be required to create an account. You are responsible for
              maintaining the confidentiality of your login credentials and all
              activities that occur under your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              3. AI Generated Content
            </h2>

            <p>
              Hirexa AI generates resumes, cover letters, and application
              materials using artificial intelligence. Users are responsible for
              reviewing and verifying generated content before submission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              4. Job Applications
            </h2>

            <p>
              Hirexa AI may assist in submitting job applications through
              third-party websites or applicant tracking systems. Hirexa AI does
              not guarantee employment outcomes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              5. Payments
            </h2>

            <p>
              Some features may require payment or subscription. Payments are
              processed by third-party payment providers such as Stripe.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              6. Acceptable Use
            </h2>

            <p className="mb-3">You agree not to:</p>

            <ul className="list-disc pl-6 space-y-2">
              <li>Use the service for fraudulent activities</li>
              <li>Attempt to reverse engineer the platform</li>
              <li>Disrupt or overload the service</li>
              <li>Use automation that harms the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              7. Intellectual Property
            </h2>

            <p>
              All software, branding, and technology related to Hirexa AI are
              owned by Hirexa AI and protected by intellectual property laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              8. Limitation of Liability
            </h2>

            <p>
              Hirexa AI is provided on an "as is" basis. We do not guarantee job
              placement or employment success.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              9. Termination
            </h2>

            <p>
              We reserve the right to suspend or terminate accounts that violate
              these Terms or abuse the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              10. Changes to Terms
            </h2>

            <p>
              We may update these Terms from time to time. Continued use of the
              service indicates acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              11. Contact
            </h2>

            <p>If you have questions about these Terms:</p>

            <p className="mt-5 font-medium">
              Hirexa AI
              <br />
              support@hirexa-ai.com
            </p>
          </section>

        </div>
      </main>
    </div>
  );
}
