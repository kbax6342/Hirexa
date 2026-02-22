import { redirect } from "next/navigation";
import { auth } from "@/app/lib/auth";
import AuditClient from "./auditClient";

export default async function ApplicationAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <AuditClient applicationId={id} />
    </main>
  );
}
