import "server-only";

export async function getActor() {
  // ✅ Replace with your NextAuth or custom session logic
  // Return shape: { userId?: string, guestId?: string, profileId?: string }
  return { userId: undefined, guestId: undefined, profileId: undefined };
}
