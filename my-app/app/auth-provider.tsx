"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth/react/ui";
import { authClient } from "@/lib/auth/client";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <NeonAuthUIProvider authClient={authClient} redirectTo="/dashboard">
      {children}
    </NeonAuthUIProvider>
  );
}
