// File: /my-app/app/accessibility/page.tsx

export const metadata = {
    title: "Accessibility | Hirexa AI",
    description: "Accessibility commitment for Hirexa AI.",
  };
  
  export default function AccessibilityPage() {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-4xl px-6 py-20">
  
          <div className="mb-12">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              Accessibility
            </h1>
  
            <p className="mt-3 text-sm text-gray-500">
              Last Updated: March 5, 2026
            </p>
          </div>
  
          <div className="space-y-10 text-gray-700 leading-relaxed">
  
            <section>
              <p>
                Hirexa AI is committed to ensuring digital accessibility for all
                users, including individuals with disabilities. We are continually
                improving the user experience for everyone and applying relevant
                accessibility standards where possible.
              </p>
            </section>
  
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Accessibility Standards
              </h2>
  
              <p>
                We aim to follow best practices and standards defined by the
                Web Content Accessibility Guidelines (WCAG) to improve usability
                for all users.
              </p>
            </section>
  
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Ongoing Improvements
              </h2>
  
              <p>
                Hirexa AI continuously works to improve the accessibility of our
                platform by reviewing design patterns, navigation, and interaction
                elements to make sure they are usable by the widest possible
                audience.
              </p>
            </section>
  
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Need Help?
              </h2>
  
              <p>
                If you experience difficulty accessing any part of the Hirexa AI
                website or services, please contact us and we will work to provide
                the information or assistance you need.
              </p>
  
              <p className="mt-3 font-medium">
                support@hirexa.ai
              </p>
            </section>
  
          </div>
        </main>
      </div>
    );
  }