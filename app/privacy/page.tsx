// File: /my-app/app/privacy/page.tsx

export const metadata = {
  title: "Privacy Policy | Hirexa AI",
  description: "Privacy Policy for Hirexa AI",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen ">
      <main className="mx-auto max-w-4xl px-6 py-20">

        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-white">
            Privacy Policy
          </h1>

          <p className="mt-3 text-sm text-white">
            Effective Date: March 5, 2026
          </p>
        </div>

        {/* Content */}
        <div className="space-y-10 text-white leading-relaxed">

          <section>
            <p>
              Hirexa AI ("Hirexa", "we", "our", or "us") respects your privacy and is
              committed to protecting the personal information you share with us.
              This Privacy Policy explains how we collect, use, disclose, and
              safeguard your information when you use the Hirexa AI platform and
              services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              1. Information We Collect
            </h2>

            <h3 className="font-semibold text-white mt-4 mb-2">
              Personal Information
            </h3>

            <ul className="list-disc pl-6 space-y-2">
              <li>Name</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Address</li>
              <li>Professional information</li>
              <li>Education history</li>
              <li>Skills and qualifications</li>
            </ul>

            <h3 className="font-semibold text-white mt-6 mb-2">
              Resume and Application Data
            </h3>

            <p>
              Hirexa AI allows users to upload resumes and submit job links. We
              may collect resume files, cover letters, job application
              information, and application history.
            </p>

            <h3 className="font-semibold text-white mt-6 mb-2">
              Account Information
            </h3>

            <ul className="list-disc pl-6 space-y-2">
              <li>Login credentials</li>
              <li>Authentication provider information</li>
              <li>Account preferences</li>
            </ul>

            <h3 className="font-semibold text-white mt-6 mb-2">
              Payment Information
            </h3>

            <p>
              Payments are processed by third-party providers such as Stripe.
              Hirexa AI does not store full credit card numbers.
            </p>

            <h3 className="font-semibold text-white mt-6 mb-2">
              Usage Data
            </h3>

            <ul className="list-disc pl-6 space-y-2">
              <li>IP address</li>
              <li>Browser and device type</li>
              <li>Pages visited</li>
              <li>Session activity</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              2. How We Use Your Information
            </h2>

            <p className="mb-3">We use your information to:</p>

            <ul className="list-disc pl-6 space-y-2">
              <li>Operate and maintain the Hirexa AI platform</li>
              <li>Generate resumes, cover letters, and job materials</li>
              <li>Automate job application processes</li>
              <li>Improve AI job matching</li>
              <li>Provide customer support</li>
              <li>Improve system performance and security</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              3. AI Processing
            </h2>

            <p>
              Hirexa AI uses artificial intelligence to process resumes, job
              descriptions, and career information to generate application
              materials and improve job matching. Users should review AI
              generated outputs before submitting applications.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              4. Sharing Information
            </h2>

            <p className="mb-3">We do not sell your personal information.</p>

            <p>
              We may share information with service providers such as hosting
              providers, analytics providers, payment processors, and AI
              infrastructure providers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              5. Third-Party Job Platforms
            </h2>

            <p>
              When using Hirexa AI to apply for jobs, your information may be
              transmitted to third-party job platforms or employer applicant
              tracking systems. These services operate under their own privacy
              policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              6. Data Security
            </h2>

            <p>
              We implement industry-standard security measures including
              encryption, secure authentication, and access control. However,
              no internet transmission is completely secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              7. Data Retention
            </h2>

            <p>
              We retain user data as long as necessary to provide our services
              and comply with legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              8. Your Rights
            </h2>

            <p className="mb-3">You may request to:</p>

            <ul className="list-disc pl-6 space-y-2">
              <li>Access your data</li>
              <li>Correct inaccurate information</li>
              <li>Delete your account</li>
              <li>Export your information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              9. Cookies
            </h2>

            <p>
              Hirexa AI may use cookies to maintain sessions, analyze usage,
              and improve user experience.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              10. Children's Privacy
            </h2>

            <p>
              Hirexa AI is not intended for individuals under the age of 18.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              11. Changes to this Policy
            </h2>

            <p>
              We may update this Privacy Policy periodically. Updates will be
              posted on this page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              12. Contact
            </h2>

            <p>If you have questions about this Privacy Policy:</p>

            <p className="mt-3 font-medium">
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
