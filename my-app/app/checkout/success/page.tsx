import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  if (!session_id) {
    redirect("/job-hunter-pack");
  }

  const purchase = await prisma.purchase.findUnique({
    where: { stripeSessionId: session_id },
    select: { jobHunterPackId: true },
  });

  if (!purchase?.jobHunterPackId) {
    redirect("/job-hunter-pack");
  }

  redirect(`/job-hunter-pack/${purchase.jobHunterPackId}`);
}
