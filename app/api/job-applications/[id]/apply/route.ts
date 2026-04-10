import {
  POST as applyWithOpenClaw,
  runtime,
} from "@/app/api/applications/[id]/apply/route";

export { runtime };

type LegacyApplyBody = {
  overrides?: Record<string, unknown>;
};

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const body = (await req.json().catch(() => ({}))) as LegacyApplyBody;
  const nextRequest = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({
      answers: body.overrides ?? {},
    }),
  });

  return applyWithOpenClaw(nextRequest, context);
}
