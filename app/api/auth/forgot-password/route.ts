export const runtime = "nodejs";

import { POST as handleForgotPassword } from "@/app/api/auth/password/forgot/route";

export async function POST(req: Request) {
  return handleForgotPassword(req);
}
