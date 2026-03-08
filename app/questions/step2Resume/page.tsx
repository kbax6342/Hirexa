import { Suspense } from "react";

import Step2ResumeClient from "./step2ResumeClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <Step2ResumeClient />
    </Suspense>
  );
}
