import type { FastifyPluginAsync } from "fastify";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { findStoreAccess } from "../auth/store-access.js";
import { db } from "../db/client.js";
import { priceChangeEvents, products, syncRuns } from "../db/schema.js";

const runQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  status: z.enum(["received", "processing", "applied", "failed"]).optional(),
});

const priceHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  productId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export const historyRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Params: { storeId: string };
    Querystring: { limit?: string; offset?: string; status?: string };
  }>("/v1/stores/:storeId/imports", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const parsedQuery = runQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "INVALID_QUERY", requestId: request.id });
    }

    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) {
      return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    }

    const filters = [eq(syncRuns.storeId, access.storeId)];
    if (parsedQuery.data.status) filters.push(eq(syncRuns.status, parsedQuery.data.status));

    const imports = await db
      .select({
        id: syncRuns.id,
        sourceSystem: syncRuns.sourceSystem,
        status: syncRuns.status,
        rowsReceived: syncRuns.rowsReceived,
        productsCreated: syncRuns.productsCreated,
        pricesChanged: syncRuns.pricesChanged,
        errorSummary: syncRuns.errorSummary,
        createdAt: syncRuns.createdAt,
        startedAt: syncRuns.startedAt,
        completedAt: syncRuns.completedAt,
      })
      .from(syncRuns)
      .where(and(...filters))
      .orderBy(desc(syncRuns.createdAt))
      .limit(parsedQuery.data.limit)
      .offset(parsedQuery.data.offset);

    return { imports, limit: parsedQuery.data.limit, offset: parsedQuery.data.offset };
  });

  app.get<{
    Params: { storeId: string };
    Querystring: { limit?: string; offset?: string; productId?: string; from?: string; to?: string };
  }>("/v1/stores/:storeId/price-changes", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const parsedQuery = priceHistoryQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({
        error: "INVALID_QUERY",
        issues: parsedQuery.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
        requestId: request.id,
      });
    }

    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) {
      return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    }

    if (parsedQuery.data.from && parsedQuery.data.to && new Date(parsedQuery.data.from) > new Date(parsedQuery.data.to)) {
      return reply.code(400).send({ error: "INVALID_DATE_RANGE", requestId: request.id });
    }

    const filters = [eq(priceChangeEvents.storeId, access.storeId)];
    if (parsedQuery.data.productId) filters.push(eq(priceChangeEvents.productId, parsedQuery.data.productId));
    if (parsedQuery.data.from) filters.push(gte(priceChangeEvents.occurredAt, new Date(parsedQuery.data.from)));
    if (parsedQuery.data.to) filters.push(lte(priceChangeEvents.occurredAt, new Date(parsedQuery.data.to)));

    const changes = await db
      .select({
        id: priceChangeEvents.id,
        productId: priceChangeEvents.productId,
        productName: products.name,
        syncRunId: priceChangeEvents.syncRunId,
        oldAmount: priceChangeEvents.oldAmount,
        newAmount: priceChangeEvents.newAmount,
        occurredAt: priceChangeEvents.occurredAt,
      })
      .from(priceChangeEvents)
      .innerJoin(products, eq(products.id, priceChangeEvents.productId))
      .where(and(...filters))
      .orderBy(desc(priceChangeEvents.occurredAt))
      .limit(parsedQuery.data.limit)
      .offset(parsedQuery.data.offset);

    return { changes, limit: parsedQuery.data.limit, offset: parsedQuery.data.offset };
  });
};
