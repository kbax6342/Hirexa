import { auth as neonAuth } from "@/lib/auth/server";

// Backward-compatible callable + keeps middleware/handler access
const auth = Object.assign(
  async () => neonAuth.getSession(),
  neonAuth
);

export { auth };
