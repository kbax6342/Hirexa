import {
  POST as applyApplicationRoute,
} from "@/app/api/applications/[id]/apply/route";
import { auth } from "@/app/lib/auth";

export const runtime = "nodejs";

type LegacyApplyBody = {
  overrides?: Record<string, unknown>;
};

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const sessionUserId = session?.user?.id ?? null;
  const sessionEmail = session?.user?.email ?? null;
  const body = (await req.json().catch(() => ({}))) as LegacyApplyBody;
  const { id } = await context.params;

  console.log("[AUTO_APPLY_ROUTE] POST /api/job-applications/[id]/apply", {
    applicationId: id,
    route: `/api/job-applications/${id}/apply`,
    sessionUserId,
    sessionEmail,
  });

  const nextRequest = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({
      answers: body.overrides ?? {},
    }),
  });

  return applyApplicationRoute(nextRequest, {
    params: Promise.resolve({ id }),
  });
}
