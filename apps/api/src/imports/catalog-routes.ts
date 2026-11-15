import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  externalProductKeys,
  organizationMemberships,
  products,
  storePrices,
  stores,
  syncRuns,
  syncStagingPrices,
} from "../db/schema.js";
import { CsvValidationError, parseCatalogCsv } from "./parse-csv.js";

const SOURCE_SYSTEM = "csv-pilot";
const BODY_LIMIT_BYTES = 8 * 1024 * 1024;
const INSERT_BATCH_SIZE = 500;

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export const catalogImportRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    "text/csv",
    { parseAs: "string" },
    (_request, body, done) => done(null, body.toString()),
  );

  app.post<{
    Params: { storeId: string };
  }>(
    "/v1/stores/:storeId/imports/products",
    { preHandler: app.authenticate, bodyLimit: BODY_LIMIT_BYTES },
    async (request, reply) => {
      const identity = request.identity;
      if (!identity) {
        return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
      }

      const [store] = await db
        .select({ id: stores.id, organizationId: stores.organizationId })
        .from(stores)
        .innerJoin(organizationMemberships, eq(organizationMemberships.organizationId, stores.organizationId))
        .where(and(
          eq(stores.id, request.params.storeId),
          eq(organizationMemberships.authUserId, identity.userId),
          inArray(organizationMemberships.role, ["owner", "manager"]),
        ))
        .limit(1);

      if (!store) {
        return reply.code(404).send({
          error: "STORE_NOT_FOUND",
          message: "Loja não encontrada ou sem permissão para importar dados.",
          requestId: request.id,
        });
      }

      const [syncRun] = await db
        .insert(syncRuns)
        .values({
          organizationId: store.organizationId,
          storeId: store.id,
          sourceSystem: SOURCE_SYSTEM,
          requestedBy: identity.userId,
        })
        .returning({ id: syncRuns.id });

      if (!syncRun) {
        throw new Error("A execução de importação não pôde ser criada.");
      }

      if (typeof request.body !== "string") {
        await db.update(syncRuns).set({
          status: "failed",
          errorSummary: "O corpo precisa ser enviado como text/csv.",
          completedAt: new Date(),
        }).where(eq(syncRuns.id, syncRun.id));

        return reply.code(415).send({
          error: "UNSUPPORTED_MEDIA_TYPE",
          message: "Envie o arquivo no corpo da requisição com Content-Type: text/csv.",
          syncRunId: syncRun.id,
          requestId: request.id,
        });
      }

      let parsedRows: ReturnType<typeof parseCatalogCsv>;
      try {
        parsedRows = parseCatalogCsv(request.body);
      } catch (error) {
        const issues = error instanceof CsvValidationError
          ? error.issues
          : ["O conteúdo enviado não pôde ser validado como CSV."];
        await db.update(syncRuns).set({
          status: "failed",
          errorSummary: issues.join(" ").slice(0, 2_000),
          completedAt: new Date(),
        }).where(eq(syncRuns.id, syncRun.id));

        return reply.code(422).send({
          error: "INVALID_CSV",
          message: "Corrija o arquivo e envie novamente.",
          issues,
          syncRunId: syncRun.id,
          requestId: request.id,
        });
      }

      await db.update(syncRuns).set({
        status: "processing",
        rowsReceived: parsedRows.length,
        startedAt: new Date(),
      }).where(eq(syncRuns.id, syncRun.id));

      try {
        const result = await db.transaction(async (tx) => {
          // Imports from one organization/source are serialized so product-code mappings cannot race.
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${store.organizationId}), hashtext(${SOURCE_SYSTEM}))`);

          const productIdsByExternalKey = new Map<string, string>();
          for (const keyBatch of chunks(parsedRows.map((row) => row.externalKey), INSERT_BATCH_SIZE)) {
            const mappings = await tx
              .select({ externalKey: externalProductKeys.externalKey, productId: externalProductKeys.productId })
              .from(externalProductKeys)
              .where(and(
                eq(externalProductKeys.organizationId, store.organizationId),
                eq(externalProductKeys.sourceSystem, SOURCE_SYSTEM),
                inArray(externalProductKeys.externalKey, keyBatch),
              ));
            for (const mapping of mappings) {
              productIdsByExternalKey.set(mapping.externalKey, mapping.productId);
            }
          }

          const newProducts: Array<{ id: string; organizationId: string; name: string; unit: string }> = [];
          const newKeys: Array<{ organizationId: string; productId: string; sourceSystem: string; externalKey: string }> = [];
          const stagedRows: Array<typeof syncStagingPrices.$inferInsert> = [];
          const now = new Date();

          for (const row of parsedRows) {
            let productId = productIdsByExternalKey.get(row.externalKey);
            if (!productId) {
              productId = randomUUID();
              productIdsByExternalKey.set(row.externalKey, productId);
              newProducts.push({ id: productId, organizationId: store.organizationId, name: row.name, unit: row.unit });
              newKeys.push({
                organizationId: store.organizationId,
                productId,
                sourceSystem: SOURCE_SYSTEM,
                externalKey: row.externalKey,
              });
            }
            stagedRows.push({
              organizationId: store.organizationId,
              storeId: store.id,
              syncRunId: syncRun.id,
              productId,
              sourceSystem: SOURCE_SYSTEM,
              externalKey: row.externalKey,
              productName: row.name,
              unit: row.unit,
              amount: row.amount,
              rowNumber: row.rowNumber,
            });
          }

          for (const batch of chunks(newProducts, INSERT_BATCH_SIZE)) {
            await tx.insert(products).values(batch);
          }
          for (const batch of chunks(newKeys, INSERT_BATCH_SIZE)) {
            await tx.insert(externalProductKeys).values(batch);
          }
          for (const batch of chunks(stagedRows, INSERT_BATCH_SIZE)) {
            await tx.insert(syncStagingPrices).values(batch);
          }

          await tx.execute(sql`
            update products as product
            set name = staging.product_name,
                unit = staging.unit,
                updated_at = ${now}
            from sync_staging_prices as staging
            where staging.sync_run_id = ${syncRun.id}
              and staging.product_id = product.id
              and staging.organization_id = product.organization_id
          `);

          const insertedEvents = await tx.execute(sql`
            insert into price_change_events (
              organization_id, store_id, product_id, sync_run_id, old_amount, new_amount
            )
            select staging.organization_id,
                   staging.store_id,
                   staging.product_id,
                   staging.sync_run_id,
                   current_price.amount,
                   staging.amount
            from sync_staging_prices as staging
            left join store_prices as current_price
              on current_price.store_id = staging.store_id
             and current_price.product_id = staging.product_id
            where staging.sync_run_id = ${syncRun.id}
              and (current_price.id is null or current_price.amount is distinct from staging.amount)
            on conflict (sync_run_id, product_id) do nothing
            returning id
          `);

          await tx.execute(sql`
            insert into store_prices (
              organization_id, store_id, product_id, amount, currency, updated_at
            )
            select organization_id, store_id, product_id, amount, 'BRL', ${now}
            from sync_staging_prices
            where sync_run_id = ${syncRun.id}
            on conflict (store_id, product_id) do update
            set amount = excluded.amount,
                currency = excluded.currency,
                updated_at = excluded.updated_at
            where store_prices.amount is distinct from excluded.amount
          `);

          await tx.delete(syncStagingPrices).where(eq(syncStagingPrices.syncRunId, syncRun.id));
          await tx.update(syncRuns).set({
            status: "applied",
            rowsReceived: parsedRows.length,
            productsCreated: newProducts.length,
            pricesChanged: insertedEvents.rows.length,
            completedAt: new Date(),
          }).where(eq(syncRuns.id, syncRun.id));

          return {
            rowsImported: parsedRows.length,
            productsCreated: newProducts.length,
            pricesChanged: insertedEvents.rows.length,
          };
        });

        return reply.code(201).send({
          syncRunId: syncRun.id,
          status: "applied",
          ...result,
        });
      } catch (error) {
        request.log.error({ err: error, syncRunId: syncRun.id }, "Catalog CSV import failed");
        await db.update(syncRuns).set({
          status: "failed",
          errorSummary: "A publicação foi cancelada e os preços anteriores foram preservados.",
          completedAt: new Date(),
        }).where(eq(syncRuns.id, syncRun.id));

        return reply.code(500).send({
          error: "IMPORT_FAILED",
          message: "A importação falhou; os preços anteriores foram preservados. Verifique o histórico de importações.",
          syncRunId: syncRun.id,
          requestId: request.id,
        });
      }
    },
  );
};
