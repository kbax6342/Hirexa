import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getAuthedUserId, unauthorizedJson } from "@/app/lib/agents/getAuthedUser";

export async function GET(req: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return unauthorizedJson();

  const campaign = await prisma.outreachCampaign.findUnique({ where: { userId }, select: { id: true } });
  if (!campaign) return NextResponse.json({ ok: true, leads: [], total: 0 });

  const { searchParams } = new URL(req.url);
  const take = Math.min(100, Math.max(1, Number(searchParams.get("take") ?? 50)));
  const skip = Math.max(0, Number(searchParams.get("skip") ?? 0));
  const outreachJobTargetId = searchParams.get("outreachJobTargetId");

  const where = {
    campaignId: campaign.id,
    ...(outreachJobTargetId ? { outreachJobTargetId } : {}),
  };

  const [leads, total] = await Promise.all([
    prisma.recruiterLead.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take,
      skip,
    }),
    prisma.recruiterLead.count({ where }),
  ]);

  return NextResponse.json({ ok: true, leads, total, take, skip });
}

export async function DELETE(req: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return unauthorizedJson();

  const campaign = await prisma.outreachCampaign.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!campaign) {
    return NextResponse.json({ ok: false, error: "No campaign found." }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId") ?? searchParams.get("id");

  if (!leadId) {
    return NextResponse.json({ ok: false, error: "Missing leadId." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const lead = await tx.recruiterLead.findFirst({
        where: { id: leadId, campaignId: campaign.id },
        select: { id: true, outreachJobTargetId: true },
      });

      if (!lead) {
        throw new Error("Lead not found.");
      }

      if (lead.outreachJobTargetId) {
        const jobTarget = await tx.outreachJobTarget.findUnique({
          where: { id: lead.outreachJobTargetId },
          select: { leadsFound: true },
        });

        const nextCount = Math.max(0, (jobTarget?.leadsFound ?? 0) - 1);
        await tx.outreachJobTarget.update({
          where: { id: lead.outreachJobTargetId },
          data: { leadsFound: nextCount },
        });
      }

      await tx.recruiterLead.delete({ where: { id: lead.id } });
    });

    return NextResponse.json({ ok: true, deletedId: leadId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete lead.";
    const status = message === "Lead not found." ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
