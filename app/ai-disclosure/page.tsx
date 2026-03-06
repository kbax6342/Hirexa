// File: /my-app/app/ai-disclosure/page.tsx

export const metadata = {
    title: "AI Use Disclosure | Hirexa AI",
    description: "How Hirexa AI uses artificial intelligence within the platform.",
  };
  
  export default function AIDisclosurePage() {
    return (
      <div className="min-h-screen ">
        <main className="mx-auto max-w-4xl px-6 py-20">
  
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              AI Use Disclosure
            </h1>
  
            <p className="mt-3 text-sm text-gray-500">
              Last Updated: March 5, 2026
            </p>
          </div>
  
          {/* Content */}
          <div className="space-y-10 text-gray-700 leading-relaxed">
  
            <section>
              <p>
                Hirexa AI uses artificial intelligence to assist users with job
                searching, resume improvement, cover letter generation, and job
                application preparation. This page explains how AI is used within
                the Hirexa platform and the role it plays in helping users
                navigate the job search process.
              </p>
            </section>
  
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                How Hirexa Uses AI
              </h2>
  
              <p className="mb-3">
                Artificial intelligence within Hirexa AI may be used to:
              </p>
  
              <ul className="list-disc pl-6 space-y-2">
                <li>Analyze job descriptions</li>
                <li>Suggest improvements to resumes</li>
                <li>Generate customized cover letters</li>
                <li>Match users with relevant job opportunities</li>
                <li>Assist in preparing job applications</li>
                <li>Provide career guidance and recommendations</li>
              </ul>
            </section>
  
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Human Review
              </h2>
  
              <p>
                AI-generated outputs should always be reviewed by users before
                submitting applications or using the information in professional
                contexts. Hirexa AI does not guarantee the accuracy, completeness,
                or suitability of AI-generated content.
              </p>
            </section>
  
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Automated Application Assistance
              </h2>
  
              <p>
                Some features of Hirexa AI may assist users with completing job
                applications or interacting with third-party job platforms.
                Users are responsible for ensuring that submitted applications
                are accurate and appropriate before final submission.
              </p>
            </section>
  
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Limitations of AI
              </h2>
  
              <p className="mb-3">
                Artificial intelligence systems may produce inaccurate or
                incomplete information. Hirexa AI encourages users to carefully
                review all generated content.
              </p>
  
              <ul className="list-disc pl-6 space-y-2">
                <li>AI may misunderstand job descriptions</li>
                <li>Generated resumes may require editing</li>
                <li>Cover letters should be reviewed for tone and accuracy</li>
                <li>Job recommendations may not always reflect user intent</li>
              </ul>
            </section>
  
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Responsible AI Use
              </h2>
  
              <p>
                Hirexa AI is committed to using artificial intelligence responsibly
                and transparently. We continuously monitor our systems and work
                to improve fairness, usability, and reliability within our AI
                features.
              </p>
            </section>
  
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Questions
              </h2>
  
              <p>
                If you have questions about how AI is used within Hirexa AI,
                please contact us:
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