import type { FastifyPluginAsync } from "fastify";
import { and, eq, gt, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { canManageStore, findStoreAccess } from "../auth/store-access.js";
import { db } from "../db/client.js";
import { priceLabels, products, promotions, storePrices } from "../db/schema.js";

const amountPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
const createPromotionSchema = z.object({
  productId: z.uuid(),
  promotionalAmount: z.string().regex(amountPattern, "Informe um valor decimal com até duas casas."),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
});
const listQuerySchema = z.object({
  status: z.enum(["scheduled", "active", "expired", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

function amountToCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export const promotionRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Params: { storeId: string };
    Querystring: { status?: string; limit?: string; offset?: string };
  }>("/v1/stores/:storeId/promotions", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "INVALID_QUERY", requestId: request.id });
    }

    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) {
      return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    }

    const now = new Date();
    const filters = [eq(promotions.storeId, access.storeId)];
    switch (parsedQuery.data.status) {
      case "scheduled":
        filters.push(isNull(promotions.cancelledAt), gt(promotions.startsAt, now));
        break;
      case "active":
        filters.push(isNull(promotions.cancelledAt), lte(promotions.startsAt, now), gt(promotions.endsAt, now));
        break;
      case "expired":
        filters.push(isNull(promotions.cancelledAt), lte(promotions.endsAt, now));
        break;
      case "cancelled":
        filters.push(sql`${promotions.cancelledAt} is not null`);
        break;
    }

    const rows = await db
      .select({
        id: promotions.id,
        productId: promotions.productId,
        productName: products.name,
        regularAmount: promotions.regularAmount,
        promotionalAmount: promotions.promotionalAmount,
        startsAt: promotions.startsAt,
        endsAt: promotions.endsAt,
        cancelledAt: promotions.cancelledAt,
        cancelledBy: promotions.cancelledBy,
        status: sql<string>`case
          when ${promotions.cancelledAt} is not null then 'cancelled'
          when ${promotions.startsAt} > ${now} then 'scheduled'
          when ${promotions.endsAt} <= ${now} then 'expired'
          else 'active'
        end`,
        createdAt: promotions.createdAt,
      })
      .from(promotions)
      .innerJoin(products, eq(products.id, promotions.productId))
      .where(and(...filters))
      .orderBy(promotions.startsAt)
      .limit(parsedQuery.data.limit)
      .offset(parsedQuery.data.offset);

    return { promotions: rows, limit: parsedQuery.data.limit, offset: parsedQuery.data.offset };
  });

  app.post<{
    Params: { storeId: string };
    Body: unknown;
  }>("/v1/stores/:storeId/promotions", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) {
      return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    }
    if (!canManageStore(access.role)) {
      return reply.code(403).send({ error: "INSUFFICIENT_ROLE", requestId: request.id });
    }

    const parsedBody = createPromotionSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "INVALID_PROMOTION",
        issues: parsedBody.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
        requestId: request.id,
      });
    }

    const startsAt = new Date(parsedBody.data.startsAt);
    const endsAt = new Date(parsedBody.data.endsAt);
    const now = new Date();
    if (startsAt.getTime() < now.getTime() || endsAt.getTime() <= startsAt.getTime()) {
      return reply.code(400).send({
        error: "INVALID_PROMOTION_PERIOD",
        message: "A promoção deve começar agora ou no futuro e terminar depois do início.",
        requestId: request.id,
      });
    }

    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${access.storeId}), hashtext(${parsedBody.data.productId}))`);

      const [price] = await tx
        .select({
          productId: storePrices.productId,
          organizationId: storePrices.organizationId,
          regularAmount: storePrices.amount,
          productName: products.name,
        })
        .from(storePrices)
        .innerJoin(products, eq(products.id, storePrices.productId))
        .where(and(
          eq(storePrices.storeId, access.storeId),
          eq(storePrices.productId, parsedBody.data.productId),
          eq(storePrices.organizationId, access.organizationId),
        ))
        .for("update")
        .limit(1);

      if (!price) {
        return { error: "PRODUCT_PRICE_NOT_FOUND" as const };
      }
      if (amountToCents(parsedBody.data.promotionalAmount) >= amountToCents(price.regularAmount)) {
        return { error: "PROMO_PRICE_NOT_LOWER" as const, regularAmount: price.regularAmount };
      }

      const [overlap] = await tx
        .select({ id: promotions.id })
        .from(promotions)
        .where(and(
          eq(promotions.storeId, access.storeId),
          eq(promotions.productId, price.productId),
          isNull(promotions.cancelledAt),
          lt(promotions.startsAt, endsAt),
          gt(promotions.endsAt, startsAt),
        ))
        .limit(1);

      if (overlap) {
        return { error: "PROMOTION_OVERLAP" as const };
      }

      const [promotion] = await tx
        .insert(promotions)
        .values({
          organizationId: access.organizationId,
          storeId: access.storeId,
          productId: price.productId,
          regularAmount: price.regularAmount,
          promotionalAmount: parsedBody.data.promotionalAmount,
          startsAt,
          endsAt,
          createdBy: identity.userId,
        })
        .returning({
          id: promotions.id,
          productId: promotions.productId,
          regularAmount: promotions.regularAmount,
          promotionalAmount: promotions.promotionalAmount,
          startsAt: promotions.startsAt,
          endsAt: promotions.endsAt,
        });

      return { promotion, productName: price.productName };
    });

    if ("error" in created) {
      if (created.error === "PRODUCT_PRICE_NOT_FOUND") {
        return reply.code(404).send({ error: created.error, message: "Produto sem preço cadastrado nesta loja.", requestId: request.id });
      }
      if (created.error === "PROMO_PRICE_NOT_LOWER") {
        return reply.code(400).send({
          error: created.error,
          message: "O preço promocional precisa ser menor que o preço atual.",
          regularAmount: created.regularAmount,
          requestId: request.id,
        });
      }
      return reply.code(409).send({ error: created.error, message: "Já existe uma promoção sobreposta para este produto.", requestId: request.id });
    }

    return reply.code(201).send({ promotion: created.promotion, productName: created.productName, status: startsAt > now ? "scheduled" : "active" });
  });

  app.post<{
    Params: { storeId: string; promotionId: string };
  }>("/v1/stores/:storeId/promotions/:promotionId/cancel", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) {
      return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    }
    if (!canManageStore(access.role)) {
      return reply.code(403).send({ error: "INSUFFICIENT_ROLE", requestId: request.id });
    }

    const now = new Date();
    const cancelled = await db.transaction(async (tx) => {
      const [promotion] = await tx
        .select({ id: promotions.id, cancelledAt: promotions.cancelledAt })
        .from(promotions)
        .where(and(eq(promotions.id, request.params.promotionId), eq(promotions.storeId, access.storeId)))
        .for("update")
        .limit(1);
      if (!promotion) return "not_found" as const;
      if (promotion.cancelledAt) return "already_cancelled" as const;

      await tx.update(promotions).set({ cancelledAt: now, cancelledBy: identity.userId }).where(eq(promotions.id, promotion.id));
      await tx.update(priceLabels)
        .set({ status: "cancelled" })
        .where(and(eq(priceLabels.promotionId, promotion.id), eq(priceLabels.status, "ready_to_print")));
      await tx.update(priceLabels)
        .set({ removalDueAt: now })
        .where(and(eq(priceLabels.promotionId, promotion.id), eq(priceLabels.status, "printed")));
      return "cancelled" as const;
    });

    if (cancelled === "not_found") {
      return reply.code(404).send({ error: "PROMOTION_NOT_FOUND", requestId: request.id });
    }
    if (cancelled === "already_cancelled") {
      return reply.code(409).send({ error: "PROMOTION_ALREADY_CANCELLED", requestId: request.id });
    }
    return { status: "cancelled", removalTasksCreated: true };
  });
};
