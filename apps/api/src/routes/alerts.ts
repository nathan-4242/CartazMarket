import type { FastifyPluginAsync } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { findStoreAccess } from "../auth/store-access.js";
import { db } from "../db/client.js";
import { priceLabels, products, storeAlerts } from "../db/schema.js";

const alertsQuerySchema = z.object({
  status: z.enum(["unread", "read", "resolved"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const alertRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Params: { storeId: string };
    Querystring: { status?: string; limit?: string; offset?: string };
  }>("/v1/stores/:storeId/alerts", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const parsedQuery = alertsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "INVALID_QUERY", requestId: request.id });
    }

    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) {
      return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    }

    const filters = [eq(storeAlerts.storeId, access.storeId)];
    if (parsedQuery.data.status) filters.push(eq(storeAlerts.status, parsedQuery.data.status));

    const alerts = await db
      .select({
        id: storeAlerts.id,
        type: storeAlerts.alertType,
        status: storeAlerts.status,
        labelId: priceLabels.id,
        productId: products.id,
        productName: products.name,
        displayAmount: priceLabels.displayAmount,
        removalDueAt: priceLabels.removalDueAt,
        createdAt: storeAlerts.createdAt,
        readAt: storeAlerts.readAt,
        readBy: storeAlerts.readBy,
        resolvedAt: storeAlerts.resolvedAt,
      })
      .from(storeAlerts)
      .innerJoin(priceLabels, eq(priceLabels.id, storeAlerts.labelId))
      .innerJoin(products, eq(products.id, priceLabels.productId))
      .where(and(...filters))
      .orderBy(desc(storeAlerts.createdAt))
      .limit(parsedQuery.data.limit)
      .offset(parsedQuery.data.offset);

    return { alerts, limit: parsedQuery.data.limit, offset: parsedQuery.data.offset };
  });

  app.post<{
    Params: { storeId: string; alertId: string };
  }>("/v1/stores/:storeId/alerts/:alertId/read", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) {
      return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    }

    const [updated] = await db
      .update(storeAlerts)
      .set({ status: "read", readAt: new Date(), readBy: identity.userId })
      .where(and(
        eq(storeAlerts.id, request.params.alertId),
        eq(storeAlerts.storeId, access.storeId),
        eq(storeAlerts.status, "unread"),
      ))
      .returning({ id: storeAlerts.id, status: storeAlerts.status, readAt: storeAlerts.readAt, readBy: storeAlerts.readBy });

    if (updated) return { alert: updated };

    const [existing] = await db
      .select({ id: storeAlerts.id, status: storeAlerts.status, readAt: storeAlerts.readAt, readBy: storeAlerts.readBy })
      .from(storeAlerts)
      .where(and(eq(storeAlerts.id, request.params.alertId), eq(storeAlerts.storeId, access.storeId)))
      .limit(1);
    if (!existing) {
      return reply.code(404).send({ error: "ALERT_NOT_FOUND", requestId: request.id });
    }
    if (existing.status === "resolved") {
      return reply.code(409).send({ error: "ALERT_ALREADY_RESOLVED", requestId: request.id });
    }
    return { alert: existing };
  });
};
