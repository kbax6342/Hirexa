"use client";
import Link from "next/link";

export default function ResumeUploadPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="h-14 flex items-center px-6 bg-white border-b">
      <Link href="/" className="text-xl font-semibold tracking-tight">Hirexa</Link>
       
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="max-w-xl w-full text-center">
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-2">
            Upload your resume to get great matches
          </h1>
          <p className="text-gray-600 mb-10">
            Your resume will also help us complete applications faster.
          </p>

          {/* Upload Card */}
          <label
            htmlFor="resume-upload"
            className="cursor-pointer block border-2 border-dashed rounded-xl bg-white px-6 py-12 hover:border-blue-500 transition"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-green-50 flex items-center justify-center">
                <svg
                  className="h-7 w-7 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0l-4 4m4-4l4 4"
                  />
                </svg>
              </div>

              <div>
                <p className="text-lg font-semibold text-gray-900">
                  Upload your resume
                </p>
                <p className="text-sm text-gray-500">
                  We'll auto-fill your answers.
                </p>
              </div>
            </div>

            <input
              id="resume-upload"
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
            />
          </label>

          {/* Skip */}
          <button className="mt-10 text-blue-600 hover:underline text-sm">
            Skip for now
          </button>
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="h-20 bg-white border-t flex items-center justify-between px-6">
        <button className="flex items-center gap-2 px-6 py-2 rounded-full border border-gray-400 text-gray-700 hover:bg-gray-100">
          ← Back
        </button>

        <button className="px-8 py-2 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700">
          Next
        </button>
      </footer>
    </div>
  );
}