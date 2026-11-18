import type { FastifyPluginAsync } from "fastify";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { canManageStore, findStoreAccess } from "../auth/store-access.js";
import { db } from "../db/client.js";
import { productExpiryAlerts, productExpiryLots, products, storePrices } from "../db/schema.js";

const quantityPattern = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/;
const createLotSchema = z.object({
  productId: z.uuid(),
  lotCode: z.string().trim().min(1).max(100).optional(),
  expiresOn: z.iso.date(),
  remainingQuantity: z.string().regex(quantityPattern).nullable().optional(),
});
const listQuerySchema = z.object({
  status: z.enum(["active", "closed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
const alertQuerySchema = z.object({
  status: z.enum(["unread", "read", "resolved"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
const reviewSchema = z.object({
  action: z.enum(["no_change", "discount", "sold_out", "removed"]),
  remainingQuantity: z.string().regex(quantityPattern).nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

export const expiryRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Params: { storeId: string };
    Querystring: { status?: string; limit?: string; offset?: string };
  }>("/v1/stores/:storeId/expiry-lots", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });

    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) return reply.code(400).send({ error: "INVALID_QUERY", requestId: request.id });
    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });

    const filters = [eq(productExpiryLots.storeId, access.storeId)];
    if (parsedQuery.data.status) filters.push(eq(productExpiryLots.status, parsedQuery.data.status));
    const lots = await db
      .select({
        id: productExpiryLots.id,
        productId: productExpiryLots.productId,
        productName: products.name,
        unit: products.unit,
        lotCode: productExpiryLots.lotCode,
        expiresOn: productExpiryLots.expiresOn,
        remainingQuantity: productExpiryLots.remainingQuantity,
        status: productExpiryLots.status,
        lastReviewAction: productExpiryLots.lastReviewAction,
        lastReviewNote: productExpiryLots.lastReviewNote,
        lastReviewedAt: productExpiryLots.lastReviewedAt,
        createdAt: productExpiryLots.createdAt,
        updatedAt: productExpiryLots.updatedAt,
        daysUntilExpiry: sql<number>`${productExpiryLots.expiresOn} - ((now() at time zone ${access.timeZone})::date)`,
      })
      .from(productExpiryLots)
      .innerJoin(products, eq(products.id, productExpiryLots.productId))
      .where(and(...filters))
      .orderBy(asc(productExpiryLots.expiresOn), asc(products.name))
      .limit(parsedQuery.data.limit)
      .offset(parsedQuery.data.offset);

    return { lots, limit: parsedQuery.data.limit, offset: parsedQuery.data.offset };
  });

  app.post<{
    Params: { storeId: string };
    Body: unknown;
  }>("/v1/stores/:storeId/expiry-lots", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    if (!canManageStore(access.role)) return reply.code(403).send({ error: "INSUFFICIENT_ROLE", requestId: request.id });

    const parsedBody = createLotSchema.safeParse(request.body);
    if (!parsedBody.success) return reply.code(400).send({ error: "INVALID_EXPIRY_LOT", requestId: request.id });
    const [catalogItem] = await db
      .select({ productId: products.id, productName: products.name, unit: products.unit })
      .from(storePrices)
      .innerJoin(products, eq(products.id, storePrices.productId))
      .where(and(
        eq(storePrices.storeId, access.storeId),
        eq(storePrices.organizationId, access.organizationId),
        eq(products.id, parsedBody.data.productId),
      ))
      .limit(1);
    if (!catalogItem) return reply.code(404).send({ error: "PRODUCT_PRICE_NOT_FOUND", requestId: request.id });

    const [lot] = await db.insert(productExpiryLots).values({
      organizationId: access.organizationId,
      storeId: access.storeId,
      productId: catalogItem.productId,
      lotCode: parsedBody.data.lotCode ?? null,
      expiresOn: parsedBody.data.expiresOn,
      remainingQuantity: parsedBody.data.remainingQuantity ?? null,
      createdBy: identity.userId,
    }).returning({
      id: productExpiryLots.id,
      productId: productExpiryLots.productId,
      lotCode: productExpiryLots.lotCode,
      expiresOn: productExpiryLots.expiresOn,
      remainingQuantity: productExpiryLots.remainingQuantity,
      status: productExpiryLots.status,
      createdAt: productExpiryLots.createdAt,
    });

    return reply.code(201).send({ lot: { ...lot, productName: catalogItem.productName, unit: catalogItem.unit } });
  });

  app.get<{
    Params: { storeId: string };
    Querystring: { status?: string; limit?: string; offset?: string };
  }>("/v1/stores/:storeId/expiry-alerts", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    const parsedQuery = alertQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) return reply.code(400).send({ error: "INVALID_QUERY", requestId: request.id });
    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });

    const filters = [eq(productExpiryAlerts.storeId, access.storeId)];
    if (parsedQuery.data.status) filters.push(eq(productExpiryAlerts.status, parsedQuery.data.status));
    const alerts = await db
      .select({
        id: productExpiryAlerts.id,
        type: productExpiryAlerts.alertType,
        status: productExpiryAlerts.status,
        lotId: productExpiryLots.id,
        productId: products.id,
        productName: products.name,
        lotCode: productExpiryLots.lotCode,
        expiresOn: productExpiryLots.expiresOn,
        remainingQuantity: productExpiryLots.remainingQuantity,
        unit: products.unit,
        createdAt: productExpiryAlerts.createdAt,
        readAt: productExpiryAlerts.readAt,
        resolvedAt: productExpiryAlerts.resolvedAt,
      })
      .from(productExpiryAlerts)
      .innerJoin(productExpiryLots, eq(productExpiryLots.id, productExpiryAlerts.lotId))
      .innerJoin(products, eq(products.id, productExpiryLots.productId))
      .where(and(...filters))
      .orderBy(desc(productExpiryAlerts.createdAt))
      .limit(parsedQuery.data.limit)
      .offset(parsedQuery.data.offset);
    return { alerts, limit: parsedQuery.data.limit, offset: parsedQuery.data.offset };
  });

  app.post<{
    Params: { storeId: string; alertId: string };
  }>("/v1/stores/:storeId/expiry-alerts/:alertId/read", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });

    const [updated] = await db.update(productExpiryAlerts)
      .set({ status: "read", readAt: new Date(), readBy: identity.userId })
      .where(and(
        eq(productExpiryAlerts.id, request.params.alertId),
        eq(productExpiryAlerts.storeId, access.storeId),
        eq(productExpiryAlerts.status, "unread"),
      ))
      .returning({ id: productExpiryAlerts.id, status: productExpiryAlerts.status, readAt: productExpiryAlerts.readAt });
    if (updated) return { alert: updated };

    const [existing] = await db.select({ id: productExpiryAlerts.id, status: productExpiryAlerts.status })
      .from(productExpiryAlerts)
      .where(and(eq(productExpiryAlerts.id, request.params.alertId), eq(productExpiryAlerts.storeId, access.storeId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: "EXPIRY_ALERT_NOT_FOUND", requestId: request.id });
    if (existing.status === "resolved") return reply.code(409).send({ error: "EXPIRY_ALERT_ALREADY_RESOLVED", requestId: request.id });
    return { alert: existing };
  });

  app.post<{
    Params: { storeId: string; lotId: string };
    Body: unknown;
  }>("/v1/stores/:storeId/expiry-lots/:lotId/review", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    if (!canManageStore(access.role)) return reply.code(403).send({ error: "INSUFFICIENT_ROLE", requestId: request.id });
    const parsedBody = reviewSchema.safeParse(request.body);
    if (!parsedBody.success) return reply.code(400).send({ error: "INVALID_EXPIRY_REVIEW", requestId: request.id });

    const closed = parsedBody.data.action === "sold_out" || parsedBody.data.action === "removed";
    const now = new Date();
    const reviewed = await db.transaction(async (tx) => {
      const [lot] = await tx.update(productExpiryLots).set({
        ...(parsedBody.data.remainingQuantity !== undefined ? { remainingQuantity: parsedBody.data.remainingQuantity } : {}),
        ...(closed ? { remainingQuantity: "0" } : {}),
        lastReviewAction: parsedBody.data.action,
        lastReviewNote: parsedBody.data.note ?? null,
        lastReviewedAt: now,
        lastReviewedBy: identity.userId,
        updatedAt: now,
        ...(closed ? { status: "closed", closedAt: now, closedBy: identity.userId } : {}),
      }).where(and(
        eq(productExpiryLots.id, request.params.lotId),
        eq(productExpiryLots.storeId, access.storeId),
        eq(productExpiryLots.status, "active"),
      )).returning({
        id: productExpiryLots.id,
        productId: productExpiryLots.productId,
        lotCode: productExpiryLots.lotCode,
        expiresOn: productExpiryLots.expiresOn,
        remainingQuantity: productExpiryLots.remainingQuantity,
        status: productExpiryLots.status,
        lastReviewAction: productExpiryLots.lastReviewAction,
        lastReviewNote: productExpiryLots.lastReviewNote,
        lastReviewedAt: productExpiryLots.lastReviewedAt,
      });
      if (!lot) return null;
      await tx.update(productExpiryAlerts).set({ status: "resolved", resolvedAt: now, resolvedBy: identity.userId })
        .where(and(eq(productExpiryAlerts.lotId, lot.id), sql`${productExpiryAlerts.status} <> 'resolved'`));
      return lot;
    });
    if (!reviewed) return reply.code(409).send({ error: "EXPIRY_LOT_NOT_ACTIVE", requestId: request.id });
    return { lot: reviewed };
  });
};
