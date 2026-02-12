// /app/components/loading/ResumeParsingLoadingScreen.tsx
"use client";

import React from "react";

/**
 * Full-screen loading screen shown after resume submission
 * while the resume + job are being parsed.
 *
 * Notes:
 * - Replaces FontAwesome <i> tags with inline SVG so you don't need FA scripts.
 * - Keeps the same Tailwind layout + animations from your HTML.
 */
export default function ResumeParsingLoadingScreen() {
  return (
    <div className="font-inter min-h-screen w-full bg-gradient-to-br from-[#0a1628] via-[#0f1f3d] to-[#1a1f3a] overflow-hidden">
      <style jsx global>{`
        /* Hide scrollbar */
        ::-webkit-scrollbar {
          display: none;
        }

        @keyframes rotate {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        @keyframes rotate-reverse {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(-360deg);
          }
        }

        @keyframes pulse-ring {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.4;
          }
        }

        @keyframes pulse-glow {
          0%,
          100% {
            opacity: 0.6;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.1);
          }
        }

        @keyframes orbit {
          0% {
            transform: rotate(0deg) translateX(80px) rotate(0deg);
          }
          100% {
            transform: rotate(360deg) translateX(80px) rotate(-360deg);
          }
        }

        @keyframes float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }

        @keyframes shimmer {
          0% {
            background-position: -1000px 0;
          }
          100% {
            background-position: 1000px 0;
          }
        }

        @keyframes progress {
          0% {
            width: 0%;
          }
          100% {
            width: 85%;
          }
        }

        .spinner-outer {
          animation: rotate 4s linear infinite;
        }
        .spinner-middle {
          animation: rotate-reverse 3s linear infinite;
        }
        .spinner-inner {
          animation: rotate 2s linear infinite;
        }
        .pulse-ring {
          animation: pulse-ring 2s ease-in-out infinite;
        }
        .pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        .orbit-particle {
          animation: orbit 3s linear infinite;
        }
        .float-element {
          animation: float 3s ease-in-out infinite;
        }
        .shimmer-text {
          background: linear-gradient(90deg, #1e40af 0%, #7c3aed 50%, #1e40af 100%);
          background-size: 1000px 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 3s linear infinite;
        }
        .progress-bar {
          animation: progress 4s ease-out infinite;
        }
        .glass-effect {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
      `}</style>

      <div className="relative w-full min-h-screen flex items-center justify-center">
        {/* Background blobs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 left-40 w-96 h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-10 float-element" />
          <div
            className="absolute bottom-20 right-40 w-96 h-96 bg-violet-600 rounded-full mix-blend-multiply filter blur-3xl opacity-10 float-element"
            style={{ animationDelay: "1s" }}
          />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-5" />
        </div>

        {/* Star-ish dots */}
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-violet-400 rounded-full opacity-60" />
          <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-blue-400 rounded-full opacity-40" />
          <div className="absolute bottom-1/4 left-1/3 w-2 h-2 bg-purple-400 rounded-full opacity-50" />
          <div className="absolute top-2/3 right-1/4 w-1 h-1 bg-indigo-400 rounded-full opacity-60" />
          <div className="absolute bottom-1/3 right-2/3 w-2 h-2 bg-violet-300 rounded-full opacity-40" />
        </div>

        <div className="relative z-10 flex flex-col items-center">
          {/* Header */}
          <div className="mb-16">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center shadow-2xl shadow-violet-500/30">
                  <BrainIcon className="h-7 w-7 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-violet-400 rounded-full pulse-glow" />
              </div>

              <div>
                <h1 className="text-4xl font-bold text-white tracking-tight">Hirexa AI</h1>
                <p className="text-blue-300 text-sm font-medium mt-0.5">Intelligent Job Matching</p>
              </div>
            </div>
          </div>

          {/* Spinner */}
          <div className="relative w-80 h-80 mb-12">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-72 h-72 rounded-full border-2 border-violet-500/20 pulse-ring" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="w-64 h-64 rounded-full border-2 border-blue-500/20 pulse-ring"
                style={{ animationDelay: "0.5s" }}
              />
            </div>

            <div className="absolute inset-0 flex items-center justify-center spinner-outer">
              <div className="w-64 h-64 rounded-full border-4 border-transparent border-t-violet-500 border-r-violet-400/50" />
            </div>

            <div className="absolute inset-0 flex items-center justify-center spinner-middle">
              <div className="w-48 h-48 rounded-full glass-effect shadow-2xl shadow-violet-500/20">
                <div className="w-full h-full rounded-full border-4 border-transparent border-t-blue-500 border-l-blue-400/50" />
              </div>
            </div>

            <div className="absolute inset-0 flex items-center justify-center spinner-inner">
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-600/30 to-violet-600/30 backdrop-blur-sm border border-violet-400/30 shadow-2xl shadow-violet-500/30">
                <div className="w-full h-full rounded-full border-4 border-transparent border-b-violet-400 border-r-blue-400/50" />
              </div>
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-violet-500/50 pulse-glow">
                <BriefcaseIcon className="h-7 w-7 text-white" />
              </div>
            </div>

            {/* Orbit particles */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="orbit-particle">
                <div className="w-4 h-4 bg-violet-400 rounded-full shadow-lg shadow-violet-400/50" />
              </div>
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="orbit-particle"
                style={{ animationDelay: "1s", animationDuration: "3.5s" }}
              >
                <div className="w-3 h-3 bg-blue-400 rounded-full shadow-lg shadow-blue-400/50" />
              </div>
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="orbit-particle"
                style={{ animationDelay: "2s", animationDuration: "4s" }}
              >
                <div className="w-3 h-3 bg-purple-400 rounded-full shadow-lg shadow-purple-400/50" />
              </div>
            </div>
          </div>

          {/* Copy */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-white mb-3 shimmer-text">
              Scanning job boards and matching your profile...
            </h2>
            <p className="text-blue-300/80 text-base font-medium">
              AI is analyzing thousands of opportunities
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-[480px] mb-6">
            <div className="h-2 bg-blue-950/50 rounded-full overflow-hidden backdrop-blur-sm border border-blue-800/30">
              <div className="h-full bg-gradient-to-r from-blue-500 via-violet-500 to-purple-500 rounded-full progress-bar shadow-lg shadow-violet-500/50" />
            </div>
          </div>

          {/* Status chips */}
          <div className="flex items-center gap-8 text-sm">
            <div className="flex items-center gap-2 glass-effect px-4 py-2.5 rounded-xl">
              <div className="w-2 h-2 bg-green-400 rounded-full pulse-glow" />
              <span className="text-blue-200 font-medium">Analyzing Resume</span>
            </div>

            <div className="flex items-center gap-2 glass-effect px-4 py-2.5 rounded-xl">
              <div
                className="w-2 h-2 bg-violet-400 rounded-full pulse-glow"
                style={{ animationDelay: "0.3s" }}
              />
              <span className="text-blue-200 font-medium">Matching Skills</span>
            </div>

            <div className="flex items-center gap-2 glass-effect px-4 py-2.5 rounded-xl">
              <div
                className="w-2 h-2 bg-blue-400 rounded-full pulse-glow"
                style={{ animationDelay: "0.6s" }}
              />
              <span className="text-blue-200 font-medium">Finding Opportunities</span>
            </div>
          </div>

          {/* Footer badges */}
          <div className="mt-12 flex items-center gap-6">
            <div className="flex items-center gap-2 text-blue-300/60 text-sm">
              <ShieldIcon className="h-4 w-4 text-violet-400" />
              <span>Secure &amp; Private</span>
            </div>
            <div className="w-px h-4 bg-blue-700/30" />
            <div className="flex items-center gap-2 text-blue-300/60 text-sm">
              <BoltIcon className="h-4 w-4 text-violet-400" />
              <span>AI-Powered</span>
            </div>
            <div className="w-px h-4 bg-blue-700/30" />
            <div className="flex items-center gap-2 text-blue-300/60 text-sm">
              <ClockIcon className="h-4 w-4 text-violet-400" />
              <span>Real-time Processing</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-blue-400/40 text-xs font-medium">
          Powered by Advanced AI Technology
        </div>
      </div>
    </div>
  );
}

/** Inline icons (no external scripts needed) */
function BrainIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M9 2a4 4 0 00-4 4v.5A3.5 3.5 0 004 9.9V12a4 4 0 004 4h.25A3.75 3.75 0 0012 19a3.75 3.75 0 003.75-3H16a4 4 0 004-4V9.9a3.5 3.5 0 00-1-2.4V6a4 4 0 00-4-4h-1a3 3 0 00-3 3v14a2.25 2.25 0 01-2.25-2.25V6.5A4.5 4.5 0 019 2z" />
    </svg>
  );
}

function BriefcaseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M9 6a3 3 0 013-3h0a3 3 0 013 3v1h3a2 2 0 012 2v3.5a2 2 0 01-2 2h-1.5v-1a1 1 0 00-1-1h-7a1 1 0 00-1 1v1H6a2 2 0 01-2-2V9a2 2 0 012-2h3V6zm2 1h2V6a1 1 0 00-2 0v1z" />
      <path d="M8.5 15.5h7v3a2 2 0 01-2 2h-3a2 2 0 01-2-2v-3z" />
    </svg>
  );
}

function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2l7 4v6c0 5-3 9-7 10-4-1-7-5-7-10V6l7-4z" />
    </svg>
  );
}

function BoltIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 11h4v-2h-3V7h-2v6z" />
    </svg>
  );
}
