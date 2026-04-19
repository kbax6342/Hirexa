import { notFound, redirect } from "next/navigation";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export default async function RecruiterJobOrderDetailPage(props: RouteProps) {
  const { id } = await props.params;
  if (!id) {
    notFound();
  }

  redirect(`/agency/job-orders/${id}`);
}
