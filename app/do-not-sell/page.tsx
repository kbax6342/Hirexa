// File: /my-app/app/do-not-sell/page.tsx

export const metadata = {
    title: "Do Not Sell or Share My Personal Information | Hirexa AI",
    description: "Your privacy rights and choices regarding your personal data at Hirexa AI.",
  };
  
  export default function DoNotSellPage() {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-4xl px-6 py-20">
  
          <div className="mb-12">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              Do Not Sell or Share My Personal Information
            </h1>
  
            <p className="mt-3 text-sm text-gray-500">
              Effective Date: March 5, 2026
            </p>
          </div>
  
          <div className="space-y-10 text-gray-700 leading-relaxed">
  
            <section>
              <p>
                Hirexa AI respects your privacy and your rights regarding how your
                personal information is used. Under certain privacy laws such as the
                California Consumer Privacy Act (CCPA) and similar regulations,
                users have the right to request that businesses do not sell or share
                their personal information.
              </p>
            </section>
  
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Our Policy
              </h2>
  
              <p>
                Hirexa AI does not sell your personal information to third parties.
                We only use personal information to operate our services, improve
                the platform, process payments, and assist users with job search
                automation and related features.
              </p>
            </section>
  
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Information That May Be Shared
              </h2>
  
              <p className="mb-3">
                In order to provide the Hirexa AI platform, we may share limited
                information with trusted service providers such as:
              </p>
  
              <ul className="list-disc pl-6 space-y-2">
                <li>Cloud hosting providers</li>
                <li>Payment processors</li>
                <li>Authentication providers</li>
                <li>Analytics services</li>
                <li>AI processing infrastructure</li>
              </ul>
  
              <p className="mt-3">
                These providers only receive the information necessary to perform
                services on our behalf and are required to protect your data.
              </p>
            </section>
  
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Your Rights
              </h2>
  
              <p className="mb-3">
                You may request to:
              </p>
  
              <ul className="list-disc pl-6 space-y-2">
                <li>Know what personal data we collect</li>
                <li>Request deletion of your personal data</li>
                <li>Request access to the data associated with your account</li>
                <li>Request that your data not be sold or shared</li>
              </ul>
            </section>
  
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                How to Submit a Request
              </h2>
  
              <p>
                To submit a privacy request regarding your personal data, please
                contact us at:
              </p>
  
              <p className="mt-3 font-medium">
                privacy@hirexa.ai
              </p>
            </section>
  
          </div>
        </main>
      </div>
    );
  }