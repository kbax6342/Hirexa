import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const params = await searchParams;
  const sessionId = typeof params.session_id === "string" ? params.session_id : "";

  if (!sessionId) {
    redirect("/job-hunter-pack");
  }

  const purchase = await prisma.purchase.findUnique({
    where: { stripeSessionId: sessionId },
    select: { packId: true },
  });

  if (!purchase?.packId) {
    redirect("/job-hunter-pack");
  }

  redirect(`/job-hunter-pack/${purchase.packId}`);
}
