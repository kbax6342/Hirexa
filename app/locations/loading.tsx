export default function LocationsLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />

      <p className="mt-6 text-lg text-slate-300">
        Finding the best jobs for you...
      </p>
    </div>
  );
}
