


  "use client";

import { useEffect, useState } from "react";

type JobResult = {
  objectId: string;
  title: string;
};
type JobSearchSelectProps = {
  value: string[];
  onChange: (v: string[]) => void;
};


export default function JobSearchSelect({
  value,
  onChange,
}: JobSearchSelectProps ) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<JobResult[]>([]);
  const [loading, setLoading] = useState(false);

  // 🔍 Search API (debounced)
  // useEffect(() => {
  //   if (input.length < 2) {
  //     setResults([]);
  //     return;
  //   }

  //   const timeout = setTimeout(async () => {
  //     setLoading(true);
  //     try {
  //       const res = await fetch(`/api/jobs?q=${encodeURIComponent(input)}`);
  //       const data = await res.json();
  //       setResults(data.results || []);
  //     } catch (err) {
  //       console.error("Job search failed", err);
  //     } finally {
  //       setLoading(false);
  //     }
  //   }, 300);

  //   return () => clearTimeout(timeout);
  // }, [input]);
  useEffect(() => {
    if (input.length < 2) {
      setResults([]);
      return;
    }
  
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/job-title-suggestions?q=${encodeURIComponent(input)}`);
        const data = await res.json();
        setResults(data);
      } catch (err) {
        console.error(err);
      }
    }, 300);
  
    return () => clearTimeout(timeout);
  }, [input]);
  


  const addTitle = (title?: string) => {
    const finalTitle = (title ?? input).trim();
    if (!finalTitle) return;
    if (value.includes(finalTitle)) return;
    if (value.length >= 5) return;

    onChange([...value, finalTitle]);
    setInput("");
    setResults([]);
    setOpen(false);
  };

  const removeTitle = (title: string) => {
    onChange(value.filter((t) => t !== title));
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium mb-2">
        Job title, keyword or category
      </label>

      <input
        type="text"
        value={input}
        placeholder="Project manager, marketing, etc."
        onFocus={() => setOpen(true)}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTitle();
          }
        }}
        className="w-full rounded-md border border-blue-600 px-4 py-3 text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Dropdown */}
      {open && (input.length > 0 || results.length > 0) && (
        <div className="absolute z-10 mt-2 w-full rounded-lg border bg-white shadow-lg">
          <div className="max-h-64 overflow-y-auto p-2">
            {loading && (
              <p className="text-sm text-gray-400 px-3 py-2">
                Searching…
              </p>
            )}

            {!loading &&
              results.map((job) => (
                <button
                  key={job.objectId}
                  onClick={() => addTitle(job.title)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
                >
                  {job.title}
                </button>
              ))}

            {!loading && results.length === 0 && input && (
              <p className="text-sm text-gray-400 px-3 py-2">
                Press Enter to add “{input}”
              </p>
            )}
          </div>

          <div className="border-t p-3 flex justify-end">
            <button
              onClick={() => addTitle()}
              disabled={!input || value.length >= 5}
              className="px-6 py-2 rounded-full bg-blue-200 text-blue-900 font-medium
                disabled:opacity-50 hover:bg-blue-300 transition"
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* Selected titles */}
      {value.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {value.map((title) => (
            <span
              key={title}
              className="flex items-center gap-2 px-3 py-1 rounded-full
                bg-blue-100 text-blue-800 text-sm"
            >
              {title}
              <button
                onClick={() => removeTitle(title)}
                className="text-blue-600 hover:text-blue-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {value.length >= 5 && (
        <p className="text-xs text-gray-500 mt-2">
          Maximum of 5 job titles reached
        </p>
      )}
    </div>
  );
}


// export default function JobSearchSelect({
//   value = [],
//   onChange,
// }: {
//   value: string[];
//   onChange: (v: string[]) => void;
// }) {
//   const [input, setInput] = useState("");
//   const [open, setOpen] = useState(false);

//   const addTitle = () => {
//     const trimmed = input.trim();
//     if (!trimmed) return;
//     if (value.includes(trimmed)) return;
//     if (value.length >= 5) return;

//     onChange([...value, trimmed]);
//     setInput("");
//     setOpen(false);
//   };

//   const removeTitle = (title: string) => {
//     onChange(value.filter((t) => t !== title));
//   };

//   return (
//     <div className="relative">
//       <label className="block text-sm font-medium mb-2">
//         Job title, keyword or category
//       </label>

//       <input
//         type="text"
//         value={input}
//         placeholder="Project manager, marketing, etc."
//         onFocus={() => setOpen(true)}
//         onChange={(e) => setInput(e.target.value)}
//         onKeyDown={(e) => {
//           if (e.key === "Enter") {
//             e.preventDefault();
//             addTitle();
//           }
//         }}
//         className="w-full rounded-md border border-blue-600 px-4 py-3 text-sm
//           focus:outline-none focus:ring-2 focus:ring-blue-500"
//       />

//       {open && (
//         <div className="absolute z-10 mt-2 w-full rounded-lg border bg-white shadow-lg">
//           <div className="p-4">
//             <p className="text-sm text-gray-500 mb-3">
//               Press <strong>Enter</strong> or click Confirm to add
//             </p>

//             <div className="flex justify-end">
//               <button
//                 onClick={addTitle}
//                 disabled={!input || value.length >= 5}
//                 className="px-6 py-2 rounded-full bg-blue-200 text-blue-900 font-medium
//                   disabled:opacity-50 hover:bg-blue-300 transition"
//               >
//                 Confirm
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

   
//       {value.length > 0 && (
//         <div className="mt-4 flex flex-wrap gap-2">
//           {value.map((title) => (
//             <span
//               key={title}
//               className="flex items-center gap-2 px-3 py-1 rounded-full
//                 bg-blue-100 text-blue-800 text-sm"
//             >
//               {title}
//               <button
//                 onClick={() => removeTitle(title)}
//                 className="text-blue-600 hover:text-blue-800"
//               >
//                 ×
//               </button>
//             </span>
//           ))}
//         </div>
//       )}

//       {value.length >= 5 && (
//         <p className="text-xs text-gray-500 mt-2">
//           Maximum of 5 job titles reached
//         </p>
//       )}
//     </div>
//   );
// }
