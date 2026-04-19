import LoginPageClient from "@/app/components/login/LoginPageClient";
import { toSafeRelativeCallbackUrl } from "@/app/lib/auth/callbackUrl";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const mode = readFirstParam(params.mode) ?? null;
  const reason = readFirstParam(params.reason) ?? null;
  const isRecruiterMode = mode === "recruiter";
  const callbackUrl = toSafeRelativeCallbackUrl(
    readFirstParam(params.callbackUrl),
    isRecruiterMode ? "/agency/dashboard" : "/resume"
  );

  return (
    <LoginPageClient
      callbackUrl={callbackUrl}
      mode={mode}
      reason={reason}
      showRecruiterAccessNotice={isRecruiterMode && reason === "not-recruiter"}
    />
  );
}
