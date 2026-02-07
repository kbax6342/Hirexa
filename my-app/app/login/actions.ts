// app/login/actions.ts
"use server";

import { signIn } from "../lib/auth";

export async function loginAction(email: string, password: string) {
  // This will set the proper authjs.session-token cookie on the server
  await signIn("credentials", {
    email,
    password,
    redirectTo: "/dashboard",
  });
}
