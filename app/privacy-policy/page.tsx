export const metadata = {
  title: "AI Chatbot Privacy Policy | Hirexa AI",
  description: "AI chatbot privacy policy for Hirexa AI staffing chatbots.",
};

const companyName = "Hirexa AI - [Company Name]";

const informationItems = [
  "Name",
  "Phone number",
  "Email address",
  "City, state, or location",
  "Job interests",
  "Desired work type",
  "Shift availability",
  "Transportation availability",
  "Work authorization status",
  "Resume, work history, or experience information",
  "Any other information shared during the chatbot conversation",
];

const useItems = [
  "Respond to your inquiry",
  "Contact you by phone, text message, or email",
  "Review your job interests and availability",
  "Help match you with potential job opportunities",
  "Share the information with authorized hiring, recruiting, or staffing agency staff",
  "Improve staffing, recruiting, and candidate intake processes",
  "Maintain business records",
];

const sensitiveItems = [
  "Social Security numbers",
  "Banking information",
  "Medical information",
  "Government identification numbers",
  "Passwords or account login information",
];

function PolicySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="space-y-4 text-sm leading-7 text-slate-200 sm:text-base">
        {children}
      </div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-6">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function AiChatbotPrivacyPolicyPage() {
  return (
    <main className="min-h-screen px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-lg border border-white/10 bg-slate-950/80 px-5 py-8 shadow-2xl shadow-black/20 sm:px-8 sm:py-10 lg:px-10">
        <header className="border-b border-white/10 pb-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-300">
            {companyName}
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            AI Chatbot Privacy Policy
          </h1>
          <p className="mt-4 text-sm text-slate-300">
            Effective Date: [Insert Date]
          </p>
        </header>

        <div className="mt-10 space-y-10">
          <PolicySection title="1. Overview">
            <p>
              This Privacy Policy describes how information submitted through the
              Hirexa AI chatbot may be collected, saved, reviewed, and used for
              staffing, hiring, recruiting, and follow-up purposes.
            </p>
          </PolicySection>

          <PolicySection title="2. Information We Collect">
            <p>
              When you use the chatbot, we may collect information you choose to
              provide, including:
            </p>
            <BulletList items={informationItems} />
          </PolicySection>

          <PolicySection title="3. How We Use Your Information">
            <p>Your information may be used to:</p>
            <BulletList items={useItems} />
          </PolicySection>

          <PolicySection title="4. Who May Review Your Information">
            <p>
              Chatbot responses may be saved and reviewed by authorized hiring,
              recruiting, staffing agency, or business staff for follow-up and
              job-matching purposes.
            </p>
          </PolicySection>

          <PolicySection title="5. Communication Consent">
            <p>
              By submitting contact information, you understand that you may be
              contacted about your inquiry, job opportunities, application
              status, or related staffing services.
            </p>
            <p>
              Message and data rates may apply. Messaging frequency may vary. You
              may opt out of text messages at any time by replying STOP.
            </p>
          </PolicySection>

          <PolicySection title="6. Information You Should Not Submit">
            <p>
              Do not submit sensitive information through the chatbot unless it
              is specifically requested through a secure process. This includes:
            </p>
            <BulletList items={sensitiveItems} />
          </PolicySection>

          <PolicySection title="7. Data Storage and Security">
            <p>
              Chatbot information may be saved for staffing, hiring, follow-up,
              business, and recordkeeping purposes. Reasonable steps are used to
              protect information, but no online system can guarantee complete
              security.
            </p>
          </PolicySection>

          <PolicySection title="8. Links to Other Websites">
            <p>
              The website or chatbot may include links to other websites. Those
              websites may have their own privacy practices.
            </p>
          </PolicySection>

          <PolicySection title="9. Your Choices">
            <p>
              You may contact {companyName} to request access, correction, or
              deletion of information you submitted, subject to verification and
              legal or business record requirements.
            </p>
          </PolicySection>

          <PolicySection title="10. Contact Us">
            <address className="not-italic">
              {companyName}
              <br />
              Email: [Insert Contact Email]
              <br />
              Phone: [Insert Contact Phone Number]
              <br />
              Website: [Insert Website URL]
            </address>
          </PolicySection>
        </div>
      </div>
    </main>
  );
}
