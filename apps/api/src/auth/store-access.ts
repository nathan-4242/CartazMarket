import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizationMemberships, stores } from "../db/schema.js";

export async function findStoreAccess(storeId: string, userId: string) {
  const [access] = await db
    .select({
      storeId: stores.id,
      organizationId: stores.organizationId,
      timeZone: stores.timeZone,
      role: organizationMemberships.role,
    })
    .from(stores)
    .innerJoin(organizationMemberships, eq(organizationMemberships.organizationId, stores.organizationId))
    .where(and(
      eq(stores.id, storeId),
      eq(organizationMemberships.authUserId, userId),
    ))
    .limit(1);

  return access ?? null;
}

export function canManageStore(role: string): boolean {
  return role === "owner" || role === "manager";
}
