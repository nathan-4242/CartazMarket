import type { FastifyPluginAsync } from "fastify";
import { and, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { findStoreAccess } from "../auth/store-access.js";
import { db } from "../db/client.js";
import { priceLabels, products, promotions, storeAlerts, storePrices } from "../db/schema.js";

const createLabelSchema = z.object({
  productId: z.uuid(),
  promotionId: z.uuid().optional(),
});
const listLabelQuerySchema = z.object({
  status: z.enum(["ready_to_print", "printed", "removed", "cancelled"]).optional(),
  removalDueOnly: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
const printLabelQuerySchema = z.object({
  widthMm: z.coerce.number().min(40).max(300).default(100),
  heightMm: z.coerce.number().min(40).max(300).default(70),
});
const printBatchQuerySchema = printLabelQuerySchema.extend({
  labelIds: z.string().min(36).max(1_850),
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function formatCurrency(amount: string): string {
  const value = Number(amount);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function amountToCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}

type PrintLabel = {
  id: string;
  productName: string;
  unit: string;
  regularAmount: string;
  displayAmount: string;
  promotionStartsAt: Date | null;
  removalDueAt: Date | null;
};

function renderPrintPage(labels: PrintLabel[], widthMm: number, heightMm: number): string {
  const pages = labels.map((label) => {
    const isPromotion = label.promotionStartsAt !== null;
    const validity = label.removalDueAt
      ? new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "America/Sao_Paulo",
        }).format(label.removalDueAt)
      : null;
    const productName = escapeHtml(label.productName);
    const unit = escapeHtml(label.unit);
    const regularPrice = formatCurrency(label.regularAmount);
    const displayPrice = formatCurrency(label.displayAmount);

    return `<main class="label">
${isPromotion ? '<div class="flag">Oferta</div>' : '<div class="flag">Preço</div>'}
<section><h1>${productName}</h1><div class="unit">${unit}</div></section>
${isPromotion ? `<div class="old-price">De ${regularPrice}</div>` : ""}
<div class="price ${isPromotion ? "promotion" : ""}">${displayPrice}</div>
${validity ? `<div class="validity">Oferta válida até ${escapeHtml(validity)}</div>` : ""}
<footer class="footer"><span>CartazMarket</span><span>${escapeHtml(label.id.slice(0, 8))}</span></footer>
</main>`;
  }).join("\n");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cartazes CartazMarket</title>
<style>
@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; width: ${widthMm}mm; height: ${heightMm}mm; font-family: Arial, Helvetica, sans-serif; color: #111; }
body { padding: 3mm; }
.label { width: 100%; height: ${heightMm - 6}mm; border: .5mm solid #111; padding: 3mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; break-after: page; page-break-after: always; }
.label:last-child { break-after: auto; page-break-after: auto; }
.flag { text-align: center; color: #b00020; font-size: 13pt; line-height: 1; font-weight: 800; text-transform: uppercase; }
h1 { margin: 2mm 0; text-align: center; font-size: clamp(14pt, 8vw, 27pt); line-height: 1.05; overflow-wrap: anywhere; }
.unit { text-align: center; font-size: 11pt; }
.old-price { text-align: center; font-size: 11pt; color: #444; text-decoration: line-through; }
.price { text-align: center; color: #111; font-size: clamp(25pt, 15vw, 46pt); line-height: 1; font-weight: 900; letter-spacing: -.04em; white-space: nowrap; }
.price.promotion { color: #b00020; }
.validity { text-align: center; font-size: 9pt; }
.footer { display: flex; justify-content: space-between; border-top: .25mm solid #777; padding-top: 1mm; color: #555; font-size: 6pt; }
@media screen { body { margin: 12px; box-shadow: 0 2px 18px #0003; } }
@media print { body { padding: 3mm; } }
</style></head><body>${pages}</body></html>`;
}

export const labelRoutes: FastifyPluginAsync = async (app) => {
  app.post<{
    Params: { storeId: string };
    Body: unknown;
  }>("/v1/stores/:storeId/labels", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) {
      return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    }

    const parsedBody = createLabelSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "INVALID_LABEL",
        issues: parsedBody.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
        requestId: request.id,
      });
    }

    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [catalogItem] = await tx
        .select({
          productId: storePrices.productId,
          regularAmount: storePrices.amount,
          productName: products.name,
          unit: products.unit,
        })
        .from(storePrices)
        .innerJoin(products, eq(products.id, storePrices.productId))
        .where(and(
          eq(storePrices.storeId, access.storeId),
          eq(storePrices.organizationId, access.organizationId),
          eq(storePrices.productId, parsedBody.data.productId),
        ))
        .limit(1);

      if (!catalogItem) return { error: "PRODUCT_PRICE_NOT_FOUND" as const };

      const promotionFilters = [
        eq(promotions.storeId, access.storeId),
        eq(promotions.productId, catalogItem.productId),
        isNull(promotions.cancelledAt),
        gt(promotions.endsAt, now),
      ];
      if (parsedBody.data.promotionId) {
        promotionFilters.push(eq(promotions.id, parsedBody.data.promotionId));
      } else {
        promotionFilters.push(lte(promotions.startsAt, now));
      }

      const [promotion] = await tx
        .select({
          id: promotions.id,
          promotionalAmount: promotions.promotionalAmount,
          startsAt: promotions.startsAt,
          endsAt: promotions.endsAt,
        })
        .from(promotions)
        .where(and(...promotionFilters))
        .limit(1);

      if (parsedBody.data.promotionId && !promotion) {
        return { error: "PROMOTION_NOT_AVAILABLE" as const };
      }
      if (promotion && amountToCents(promotion.promotionalAmount) >= amountToCents(catalogItem.regularAmount)) {
        return { error: "PROMOTION_PRICE_OUTDATED" as const };
      }

      const [label] = await tx
        .insert(priceLabels)
        .values({
          organizationId: access.organizationId,
          storeId: access.storeId,
          productId: catalogItem.productId,
          promotionId: promotion?.id ?? null,
          regularAmount: catalogItem.regularAmount,
          displayAmount: promotion?.promotionalAmount ?? catalogItem.regularAmount,
          promotionStartsAt: promotion?.startsAt ?? null,
          removalDueAt: promotion?.endsAt ?? null,
          createdBy: identity.userId,
        })
        .returning({
          id: priceLabels.id,
          productId: priceLabels.productId,
          promotionId: priceLabels.promotionId,
          regularAmount: priceLabels.regularAmount,
          displayAmount: priceLabels.displayAmount,
          promotionStartsAt: priceLabels.promotionStartsAt,
          removalDueAt: priceLabels.removalDueAt,
          status: priceLabels.status,
          createdAt: priceLabels.createdAt,
        });

      return { label, productName: catalogItem.productName, unit: catalogItem.unit };
    });

    if ("error" in result) {
      if (result.error === "PRODUCT_PRICE_NOT_FOUND") {
        return reply.code(404).send({ error: result.error, message: "Produto sem preço cadastrado nesta loja.", requestId: request.id });
      }
      if (result.error === "PROMOTION_PRICE_OUTDATED") {
        return reply.code(409).send({ error: result.error, message: "O preço atual mudou; revise a promoção antes de gerar o cartaz.", requestId: request.id });
      }
      return reply.code(404).send({ error: result.error, message: "Promoção não encontrada, cancelada ou expirada para este produto.", requestId: request.id });
    }

    return reply.code(201).send({
      label: result.label,
      productName: result.productName,
      unit: result.unit,
      note: "Cartaz registrado. Use a rota /print para abrir a página de impressão no navegador; a impressão física depende da impressora selecionada no dispositivo.",
    });
  });

  app.get<{
    Params: { storeId: string };
    Querystring: { labelIds?: string; widthMm?: string; heightMm?: string };
  }>("/v1/stores/:storeId/labels/print-batch", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) {
      return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    }

    const parsedQuery = printBatchQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "INVALID_PRINT_REQUEST", message: "Informe os IDs separados por vírgula e dimensões entre 40 e 300 mm.", requestId: request.id });
    }

    const ids = z.array(z.uuid()).min(1).max(50).safeParse(parsedQuery.data.labelIds.split(","));
    if (!ids.success || new Set(ids.data).size !== ids.data.length) {
      return reply.code(400).send({ error: "INVALID_LABEL_IDS", message: "Envie de 1 a 50 IDs válidos e sem repetição.", requestId: request.id });
    }

    const rows = await db
      .select({
        id: priceLabels.id,
        productName: products.name,
        unit: products.unit,
        regularAmount: priceLabels.regularAmount,
        displayAmount: priceLabels.displayAmount,
        promotionStartsAt: priceLabels.promotionStartsAt,
        removalDueAt: priceLabels.removalDueAt,
        status: priceLabels.status,
      })
      .from(priceLabels)
      .innerJoin(products, eq(products.id, priceLabels.productId))
      .where(and(eq(priceLabels.storeId, access.storeId), inArray(priceLabels.id, ids.data)));

    const labelsById = new Map(rows.map((label) => [label.id, label]));
    if (rows.length !== ids.data.length || ids.data.some((id) => labelsById.get(id)?.status !== "ready_to_print")) {
      return reply.code(409).send({ error: "LABELS_NOT_READY_TO_PRINT", message: "Todos os cartazes precisam existir nesta loja e estar aguardando impressão.", requestId: request.id });
    }

    const labels = ids.data.map((id) => labelsById.get(id)!);
    return reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
      .send(renderPrintPage(labels, parsedQuery.data.widthMm, parsedQuery.data.heightMm));
  });

  app.get<{
    Params: { storeId: string; labelId: string };
    Querystring: { widthMm?: string; heightMm?: string };
  }>("/v1/stores/:storeId/labels/:labelId/print", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) {
      return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    }

    const parsedQuery = printLabelQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "INVALID_PRINT_SIZE", message: "Largura e altura devem ficar entre 40 e 300 mm.", requestId: request.id });
    }

    const [label] = await db
      .select({
        id: priceLabels.id,
        productName: products.name,
        unit: products.unit,
        regularAmount: priceLabels.regularAmount,
        displayAmount: priceLabels.displayAmount,
        promotionStartsAt: priceLabels.promotionStartsAt,
        removalDueAt: priceLabels.removalDueAt,
        status: priceLabels.status,
      })
      .from(priceLabels)
      .innerJoin(products, eq(products.id, priceLabels.productId))
      .where(and(eq(priceLabels.id, request.params.labelId), eq(priceLabels.storeId, access.storeId)))
      .limit(1);

    if (!label) return reply.code(404).send({ error: "LABEL_NOT_FOUND", requestId: request.id });
    if (label.status !== "ready_to_print") {
      return reply.code(409).send({ error: "LABEL_NOT_READY_TO_PRINT", message: "Só é possível imprimir cartazes em preparação.", requestId: request.id });
    }

    return reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
      .send(renderPrintPage([label], parsedQuery.data.widthMm, parsedQuery.data.heightMm));
  });

  app.get<{
    Params: { storeId: string };
    Querystring: { status?: string; removalDueOnly?: string; limit?: string; offset?: string };
  }>("/v1/stores/:storeId/labels", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const parsedQuery = listLabelQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "INVALID_QUERY", requestId: request.id });
    }

    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) {
      return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    }

    const now = new Date();
    const filters = [eq(priceLabels.storeId, access.storeId)];
    if (parsedQuery.data.status) filters.push(eq(priceLabels.status, parsedQuery.data.status));
    if (parsedQuery.data.removalDueOnly === "true") {
      filters.push(eq(priceLabels.status, "printed"), lte(priceLabels.removalDueAt, now));
    }

    const labels = await db
      .select({
        id: priceLabels.id,
        productId: priceLabels.productId,
        productName: products.name,
        unit: products.unit,
        promotionId: priceLabels.promotionId,
        regularAmount: priceLabels.regularAmount,
        displayAmount: priceLabels.displayAmount,
        promotionStartsAt: priceLabels.promotionStartsAt,
        removalDueAt: priceLabels.removalDueAt,
        status: priceLabels.status,
        removalDue: sql<boolean>`${priceLabels.status} = 'printed' and ${priceLabels.removalDueAt} <= ${now}`,
        createdAt: priceLabels.createdAt,
        printedAt: priceLabels.printedAt,
        removedAt: priceLabels.removedAt,
        printedBy: priceLabels.printedBy,
        removedBy: priceLabels.removedBy,
      })
      .from(priceLabels)
      .innerJoin(products, eq(products.id, priceLabels.productId))
      .where(and(...filters))
      .orderBy(desc(priceLabels.createdAt))
      .limit(parsedQuery.data.limit)
      .offset(parsedQuery.data.offset);

    return { labels, limit: parsedQuery.data.limit, offset: parsedQuery.data.offset };
  });

  app.post<{
    Params: { storeId: string; labelId: string };
  }>("/v1/stores/:storeId/labels/:labelId/printed", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) {
      return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    }

    const now = new Date();
    const [updated] = await db
      .update(priceLabels)
      .set({ status: "printed", printedAt: now, printedBy: identity.userId })
      .where(and(
        eq(priceLabels.id, request.params.labelId),
        eq(priceLabels.storeId, access.storeId),
        eq(priceLabels.status, "ready_to_print"),
      ))
      .returning({ id: priceLabels.id, status: priceLabels.status, printedAt: priceLabels.printedAt, printedBy: priceLabels.printedBy });

    if (!updated) {
      return reply.code(409).send({ error: "LABEL_NOT_READY_TO_PRINT", requestId: request.id });
    }
    return { label: updated };
  });

  app.post<{
    Params: { storeId: string; labelId: string };
  }>("/v1/stores/:storeId/labels/:labelId/removed", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const access = await findStoreAccess(request.params.storeId, identity.userId);
    if (!access) {
      return reply.code(404).send({ error: "STORE_NOT_FOUND", requestId: request.id });
    }

    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      const [label] = await tx
        .update(priceLabels)
        .set({ status: "removed", removedAt: now, removedBy: identity.userId })
        .where(and(
          eq(priceLabels.id, request.params.labelId),
          eq(priceLabels.storeId, access.storeId),
          eq(priceLabels.status, "printed"),
        ))
        .returning({ id: priceLabels.id, status: priceLabels.status, removedAt: priceLabels.removedAt, removedBy: priceLabels.removedBy });

      if (label) {
        await tx.update(storeAlerts)
          .set({ status: "resolved", resolvedAt: now })
          .where(and(
            eq(storeAlerts.labelId, label.id),
            eq(storeAlerts.storeId, access.storeId),
            sql`${storeAlerts.status} <> 'resolved'`,
          ));
      }
      return label;
    });

    if (!updated) {
      return reply.code(409).send({ error: "LABEL_NOT_PRINTED_OR_ALREADY_REMOVED", requestId: request.id });
    }
    return { label: updated };
  });
};
