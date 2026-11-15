import type { FastifyPluginAsync } from "fastify";
import { and, asc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { findStoreAccess } from "../auth/store-access.js";
import { db } from "../db/client.js";
import { products, storePrices } from "../db/schema.js";

const catalogQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export const catalogRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Params: { storeId: string };
    Querystring: { q?: string; limit?: string; offset?: string };
  }>("/v1/stores/:storeId/products", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) {
      return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    }

    const parsedQuery = catalogQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "INVALID_QUERY", requestId: request.id });
    }

    const filters = [
      eq(storePrices.storeId, access.storeId),
      eq(storePrices.organizationId, access.organizationId),
    ];
    if (parsedQuery.data.q) {
      filters.push(ilike(products.name, `%${parsedQuery.data.q}%`));
    }

    const rows = await db
      .select({
        productId: products.id,
        name: products.name,
        unit: products.unit,
        currentAmount: storePrices.amount,
        currency: storePrices.currency,
        priceUpdatedAt: storePrices.updatedAt,
      })
      .from(storePrices)
      .innerJoin(products, eq(products.id, storePrices.productId))
      .where(and(...filters))
      .orderBy(asc(products.name))
      .limit(parsedQuery.data.limit)
      .offset(parsedQuery.data.offset);

    return { products: rows, limit: parsedQuery.data.limit, offset: parsedQuery.data.offset };
  });
};
