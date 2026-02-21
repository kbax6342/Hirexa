import "server-only";

import { getActor } from "@/app/lib/apply/getActor";

export async function getActorOwnershipWhere() {
  const actor = await getActor();

  if (actor.userId) {
    return { userId: actor.userId };
  }

  if (actor.guestId) {
    return { guestId: actor.guestId };
  }

  return null;
}
