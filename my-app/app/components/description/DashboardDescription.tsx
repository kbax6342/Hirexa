"use client";

// function prettifyJobHtml(raw: string) {
//     if (!raw) return "";
  
//     let html = raw;
  
//     // If plain text, wrap paragraphs
//     const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(html);
//     if (!looksLikeHtml) {
//       const escaped = html
//         .replace(/&/g, "&amp;")
//         .replace(/</g, "&lt;")
//         .replace(/>/g, "&gt;");
//       html = escaped
//         .split(/\n{2,}/)
//         .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
//         .join("");
//     }
  
//     // 1) Normalize common bold paragraph titles into headings
//     html = html.replace(
//       /<p>\s*<(b|strong)>\s*([^<]{2,200}?)\s*:?\s*<\/(b|strong)>\s*<\/p>/gi,
//       (_m, _t1, title) => `<h3>${title.replace(/:$/, "").trim()}</h3>`
//     );
  
//     html = html.replace(
//       /<p>\s*<(b|strong)>\s*([^<]{2,200}?)\s*:?\s*<\/(b|strong)>\s*([^<].*?)<\/p>/gi,
//       (_m, _t1, title, _t2, rest) =>
//         `<h3>${title.replace(/:$/, "").trim()}</h3><p>${rest.trim()}</p>`
//     );
  
//     // 2) Canonicalize headings into the sections YOU want
//     // (Lots of ATS write these differently; map them all to your preferred names)
//     const headingMap: Array<[RegExp, string]> = [
//       [/^job description$/i, "Job Description"],
//       [/^overview$/i, "Job Description"],
//       [/^position responsibilities$/i, "Position Responsibilities"],
//       [/^responsibilities$/i, "Position Responsibilities"],
//       [/^what you will do.*$/i, "Position Responsibilities"],
  
//       [/^basic qualifications.*$/i, "Required Qualifications"],
//       [/^required qualifications.*$/i, "Required Qualifications"],
//       [/^required skills.*$/i, "Required Qualifications"],
//       [/^skills\/?experience.*$/i, "Required Qualifications"],
  
//       [/^preferred qualifications.*$/i, "Preferred Qualifications"],
  
//       [/^security clearance.*$/i, "Security Clearance"],
//       [/^clearance.*$/i, "Security Clearance"],
  
//       [/^visa sponsorship.*$/i, "Visa Sponsorship"],
//       [/^sponsorship.*$/i, "Visa Sponsorship"],
  
//       [/^travel.*$/i, "Travel"],
//       [/^drug free workplace.*$/i, "Drug Free Workplace"],
  
//       [/^pay\s*&\s*benefits.*$/i, "Pay & Benefits"],
//       [/^pay and benefits.*$/i, "Pay & Benefits"],
//       [/^compensation.*$/i, "Pay & Benefits"],
  
//       [/^equal opportunity employer.*$/i, "Equal Opportunity Employer"],
//     ];
  
//     html = html.replace(/<h3>\s*([^<]+?)\s*<\/h3>/gi, (_m, t) => {
//       const title = t.trim();
//       for (const [rx, canonical] of headingMap) {
//         if (rx.test(title)) return `<h3>${canonical}</h3>`;
//       }
//       return `<h3>${title}</h3>`;
//     });
  
//     // 3) Highlight pay ranges
//     html = html.replace(
//         /(\$[\d,]{2,})(\s*[–-]\s*)(\$[\d,]{2,})/g,
//         `<span data-pay="1">$1$2$3</span>`
//       );
      
      
  
//     // 4) Make Equal Opportunity Employer smaller
//     html = html.replace(
//       /<h3>\s*Equal Opportunity Employer\s*<\/h3>/gi,
//       `<h4>Equal Opportunity Employer</h4>`
//     );
  
//     // 5) Convert line-based blocks under key sections into bullets (when the ATS did NOT provide <ul>)
//     // This turns things like:
//     // "Supports the design...\nAssists Product Owner...\n..." into <ul><li>...</li></ul>
//     const bulletSections = [
//       "Position Responsibilities",
//       "Required Qualifications",
//       "Preferred Qualifications",
//     ];
  
//     for (const section of bulletSections) {
//       const sectionRx = new RegExp(
//         `(<h3>\\s*${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*<\\/h3>)([\\s\\S]*?)(?=<h3>|<h4>|$)`,
//         "i"
//       );
  
//       html = html.replace(sectionRx, (_m, h, body) => {
//         // If the provider already gives a list, keep it
//         if (/<ul[\s>]/i.test(body) || /<ol[\s>]/i.test(body)) return `${h}${body}`;
  
//         // Convert <p> and <br> into lines
//         const text = body
//           .replace(/<\/p>\s*<p>/gi, "\n")
//           .replace(/<br\s*\/?>/gi, "\n")
//           .replace(/<[^>]+>/g, "")
//           .split("\n")
//           .map((s) => s.trim())
//           .filter(Boolean);
  
//         // Heuristic: if we have 2+ lines, bullet them
//         if (text.length >= 2) {
//           const ul = `<ul>${text.map((t) => `<li>${t}</li>`).join("")}</ul>`;
//           return `${h}${ul}`;
//         }
  
//         // Otherwise keep original body
//         return `${h}${body}`;
//       });
//     }
  
//     // 6) Turn short “key/value” lines into chips/cards for key fields (Clearance, Sponsorship, Travel)
//     // Example: "Visa Sponsorship Employer will not sponsor..."
//     html = html.replace(
//         /<h3>\s*(Security Clearance|Visa Sponsorship|Travel|Drug Free Workplace)\s*<\/h3>\s*<p>([\s\S]*?)<\/p>/gi,
//         (_m, title, content) =>
//           `<div data-kv="1"><div data-kv-title="1">${title}</div><div data-kv-body="1">${content}</div></div>`
//       );
      
  
//     return html;
//   }
  
  

// export function JobDescription({ htmlOrText }: { htmlOrText: string }) {
//   const pretty = prettifyJobHtml(htmlOrText);
//   const safe = DOMPurify.sanitize(pretty, { USE_PROFILES: { html: true } });

//   return (
//     <div
//     className="
//     text-black
//       prose prose-sm max-w-none
//       prose-p:leading-7
//       prose-li:leading-7
//       prose-ul:pl-5
//       prose-ol:pl-5
  
//       prose-h3:mt-8 prose-h3:mb-3 prose-h3:text-base prose-h3:font-semibold prose-h3:text-gray-900
//       prose-h4:mt-8 prose-h4:mb-2 prose-h4:text-sm prose-h4:font-semibold prose-h4:text-gray-700
  
//       prose-strong:text-gray-900
  
//       /* ✅ Pay highlight */
//       [&_span[data-pay]]:font-extrabold
//       [&_span[data-pay]]:text-gray-900
//       [&_span[data-pay]]:bg-blue-50
//       [&_span[data-pay]]:px-2
//       [&_span[data-pay]]:py-0.5
//       [&_span[data-pay]]:rounded-full
//       [&_span[data-pay]]:whitespace-nowrap
  
//       /* ✅ KV cards */
//       [&_[data-kv]]:mt-4
//       [&_[data-kv]]:rounded-xl
//       [&_[data-kv]]:border
//       [&_[data-kv]]:border-gray-200
//       [&_[data-kv]]:bg-gray-50
//       [&_[data-kv]]:p-4
  
//       [&_[data-kv-title]]:font-semibold
//       [&_[data-kv-title]]:text-gray-900
//       [&_[data-kv-title]]:mb-1
  
//       [&_[data-kv-body]]:text-gray-700
//       [&_[data-kv-body]]:leading-7
//       [&_[data-kv-body]]:text-sm
//     "
//     dangerouslySetInnerHTML={{ __html: safe }}
//   />
  
//   );
// }

// "use client";

// import DOMPurify from "isomorphic-dompurify";

// function looksLikeHtml(s: string) {
//   return /<\/?[a-z][\s\S]*>/i.test(s);
// }

// export function JobDescription({ htmlOrText }: { htmlOrText: string }) {
//   const raw = htmlOrText ?? "";

//   // Fallback: if empty, show nothing but don't break layout
//   if (!raw.trim()) {
//     return <div className="text-sm text-gray-500">No description available.</div>;
//   }

//   // If it's not HTML, render as text
//   if (!looksLikeHtml(raw)) {
//     return (
//       <p className="whitespace-pre-line text-sm leading-7 text-gray-700">
//         {raw}
//       </p>
//     );
//   }

//   // If it IS HTML, sanitize and render
//   const safe = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });

//   // If sanitize nukes it (returns ""), show raw as text so you see it
//   if (!safe.trim()) {
//     return (
//       <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
//         Sanitizer removed the HTML. Showing raw text fallback:
//         <pre className="mt-2 whitespace-pre-wrap text-xs text-amber-900/90">
//           {raw}
//         </pre>
//       </div>
//     );
//   }

//   return (
//     <div
//       className="
//         prose prose-sm max-w-none
//         prose-p:leading-7
//         prose-li:leading-7
//         prose-ul:pl-5
//         prose-h3:mt-8 prose-h3:mb-3 prose-h3:text-base prose-h3:font-semibold
//         prose-h4:mt-8 prose-h4:mb-2 prose-h4:text-sm prose-h4:font-semibold prose-h4:text-gray-700
//       "
//       dangerouslySetInnerHTML={{ __html: safe }}
//     />
//   );
// }

import type { JobPretty } from "@/app/lib/jobs/types";

export function JobDescription({ pretty }: { pretty?: JobPretty | null }) {
  const safePretty: JobPretty = pretty ?? { sections: [], highlights: [] };

  return (
    <div className="space-y-6">
      {safePretty.highlights?.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {safePretty.highlights.map((h) => (
            <div
              key={h.label}
              className="rounded-xl border border-gray-200 bg-gray-50 p-4"
            >
              <div className="text-xs font-medium text-gray-500">{h.label}</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {h.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {safePretty.sections.map((s, idx) => (
        <section key={`${s.title}-${idx}`} className="space-y-3">
          <h3 className="text-base font-semibold text-gray-900">{s.title}</h3>

          {s.kind === "paragraphs" && (
            <div className="space-y-4">
                {s.paragraphs.map((t, i) => (
                <p key={i} className="text-sm leading-6 text-gray-700">
                    {t}
                </p>
                ))}
            </div>
)}

          {s.kind === "bullets" && (
            <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
              {s.bullets?.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}

          {s.kind === "callout" && s.callout && (
            <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
              {s.callout.label ? (
                <div className="font-semibold">{s.callout.label}</div>
              ) : null}
              <div>{s.callout.value}</div>
            </div>
          )}

          {s.kind === "smallprint" &&
            s.paragraphs?.map((p, i) => (
              <p key={i} className="text-xs leading-6 text-gray-500">
                {p}
              </p>
            ))}
        </section>
      ))}

      {/* Optional helpful empty state */}
      {!safePretty.sections.length ? (
        <div className="text-sm text-gray-500">Pick a job to see the full details.</div>
      ) : null}
    </div>
  );
}
