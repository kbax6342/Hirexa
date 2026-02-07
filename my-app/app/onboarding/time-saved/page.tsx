"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";



export default function JobApplicationsPage() {
  const [jobCount, setJobCount] = useState(120);
  const router = useRouter();


  // Calculate time saved based on job count
  const calculateHoursSaved = (jobs: number) => {
    return Math.round(jobs * 0.5); // 30 minutes per job
  };

  const calculateWeekendsSaved = (jobs: number) => {
    return Math.round(jobs / 30); // roughly 30 jobs per weekend
  };

  const handleNext = () => {
    router.push("/onboarding/min-salary")
    console.log("Job count selected:", jobCount);
  };

  const handleBack = () => {
    console.log("Going back");
    router.push("/onboarding/job-interest");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 bg-white border-b border-gray-200">
        <div className="text-2xl font-bold text-gray-900">Hirexa</div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-start px-6 pt-16">
        <div className="w-full max-w-2xl">
          {/* Title */}
          <h1 className="text-4xl font-bold text-center text-gray-900 mb-3">
            How many jobs do you expect to apply to?
          </h1>
          
          {/* Subtitle */}
          <p className="text-center text-gray-600 mb-12">
            We recommend applying to 100+ jobs to cast a wide net.
          </p>

          {/* Slider Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <label htmlFor="job-slider" className="text-sm font-medium text-gray-900">
                How many jobs do you expect to apply to?
              </label>
              <span className="text-lg font-bold text-gray-900">{jobCount} jobs</span>
            </div>
            
            {/* Slider */}
            <input
              id="job-slider"
              type="range"
              min="10"
              max="500"
              step="10"
              value={jobCount}
              onChange={(e) => setJobCount(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((jobCount - 10) / 490) * 100}%, #e5e7eb ${((jobCount - 10) / 490) * 100}%, #e5e7eb 100%)`
              }}
            />
          </div>

          {/* Time Savings Card */}
          <div className="bg-gray-100 rounded-2xl p-8">
            <h2 className="text-xl font-bold text-center text-gray-900 mb-2">
              Imagine what you could do with more time
            </h2>
            <p className="text-center text-gray-700 mb-8">
              By using our AI auto-apply to handle those applications,{" "}
              <span className="font-semibold">you'll save:</span>
            </p>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Hours Card */}
              <div className="bg-white rounded-xl p-6 text-center shadow-sm">
                <div className="flex justify-center mb-3">
                  <svg className="w-10 h-10 text-teal-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                  </svg>
                </div>
                <div className="text-4xl font-bold text-gray-900 mb-1">
                  {calculateHoursSaved(jobCount)}
                </div>
                <div className="text-lg font-semibold text-gray-700">Hours</div>
              </div>

              {/* Weekends Card */}
              <div className="bg-white rounded-xl p-6 text-center shadow-sm">
                <div className="flex justify-center mb-3">
                  <svg className="w-10 h-10 text-teal-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </div>
                <div className="text-4xl font-bold text-gray-900 mb-1">
                  {calculateWeekendsSaved(jobCount)}
                </div>
                <div className="text-lg font-semibold text-gray-700">Weekends</div>
              </div>
            </div>

            {/* Bottom Text */}
            <p className="text-center text-sm text-gray-700 leading-relaxed">
              Hirexa automates that busy work. Our AI instantly customizes your resume, so
              you can spend less time applying.
            </p>
          </div>
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="px-6 py-6 flex justify-between items-center border-t border-gray-200 bg-white">
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 px-6 py-3 text-gray-700 font-medium rounded-full border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>
         <button
          onClick={handleNext}
          className="px-8 py-3 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition-colors"
        >
          Next
        </button>
       
      </footer>

      {/* Custom Slider Styles */}
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 3px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 3px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider::-webkit-slider-thumb:hover {
          background: #2563eb;
        }

        .slider::-moz-range-thumb:hover {
          background: #2563eb;
        }
      `}</style>
    </div>
  );
}