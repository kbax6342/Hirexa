import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { mapProfileToForm } from "@/app/lib/greenhouse/mapProfileToForm";
import { parseGreenhouseForm } from "@/app/lib/greenhouse/parseGreenhouseForm";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const application = await prisma.jobApplication.findFirst({
      where: {
        id,
        userProfile: {
          userId,
        },
      },
      include: {
        userProfile: true,
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    if (!application.jobUrl) {
      return NextResponse.json({ error: "Application missing jobUrl" }, { status: 400 });
    }

    const form = await parseGreenhouseForm(application.jobUrl);
    const { prefillValues, auditItems } = mapProfileToForm(form.fields, application.userProfile);
    console.log("GH parse debug:", form.debug);
    console.log("GH fields count:", form.fields.length, "method:", form.method, "action:", form.action);

    const status = auditItems.filter((item) => item.required).length > 0 ? "IN_PREPARATION" : "READY_TO_SEND";

    await prisma.jobApplication.update({
      where: { id: application.id },
      data: {
        status,
        auditJson: {
          form,
          prefill: prefillValues,
          auditItems,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      status,
      prefill: prefillValues,
      auditItems,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
