import ProfileForm from "./profileForm";

export default function ProfilePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 pb-10 pt-[110]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">
              Complete your profile
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              This helps us personalize your experience.
            </p>
          </div>

          <ProfileForm />
        </div>
      </div>
    </div>
  );
}
