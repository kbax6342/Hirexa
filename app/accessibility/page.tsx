import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accessibility | Hirexa AI",
  description: "Learn about Hirexa AI's accessibility commitment and how to request assistance.",
};

const supportEmail = process.env.EMAIL_SUPPORT ?? "support@hirexa-ai.com";

export default function AccessibilityPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto max-w-4xl px-6 py-20">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.35)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">
            Accessibility
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Accessibility
          </h1>
          <p className="mt-4 text-base leading-7 text-white/80">
            Hirexa AI is committed to building a job-search experience that is usable,
            readable, and responsive across devices and assistive workflows.
          </p>
        </section>

        <div className="mt-10 space-y-6">
          <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold text-white">What we focus on</h2>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-white/80">
              <li>Keyboard-friendly flows for forms, settings, and navigation.</li>
              <li>Readable contrast, clear spacing, and responsive layouts across screen sizes.</li>
              <li>Ongoing improvements to labels, semantics, and interaction patterns.</li>
            </ul>
          </section>

          <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold text-white">Need an accessibility adjustment?</h2>
            <p className="mt-3 text-sm leading-7 text-white/80">
              If you run into an accessibility barrier or need help completing a task,
              contact us and include the page, browser, device, and the issue you hit.
            </p>
            <a
              href={`mailto:${supportEmail}`}
              className="mt-4 inline-block text-sm font-semibold text-sky-300 hover:underline"
            >
              {supportEmail}
            </a>
          </section>
        </div>
      </main>
    </div>
  );
}
