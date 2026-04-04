import JobDetailsSkeleton from "@/app/components/skeletons/JobDetailsSkeleton";

export default function JobDetailsLoading() {
  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          <JobDetailsSkeleton />
        </div>
      </main>
    </div>
  );
}
