import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import Fastify, { type InjectOptions } from "fastify";
import { and, eq } from "drizzle-orm";
import { catalogImportRoutes } from "../src/imports/catalog-routes.js";
import { historyRoutes } from "../src/routes/history.js";
import { labelRoutes } from "../src/labels/routes.js";
import { db, closeDatabaseConnection } from "../src/db/client.js";
import { env } from "../src/config/env.js";
import { organizationMemberships, organizations, priceChangeEvents, priceLabels, products, storePrices, stores } from "../src/db/schema.js";

const databaseHost = new URL(env.DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
  throw new Error("Este smoke test só pode rodar contra um PostgreSQL local; DATABASE_URL não aponta para localhost.");
}

const organizationId = randomUUID();
const storeId = randomUUID();
const managerId = randomUUID();
const app = Fastify();
app.decorateRequest("identity", null);
app.decorate("authenticate", async (request, reply) => {
  if (request.headers["x-price-test-user"] !== managerId) {
    return reply.code(401).send({ error: "UNAUTHENTICATED" });
  }
  request.identity = { userId: managerId, email: null };
});
app.register(catalogImportRoutes);
app.register(historyRoutes);
app.register(labelRoutes);

async function inject(options: InjectOptions) {
  return app.inject({ ...options, headers: { "x-price-test-user": managerId, ...options.headers } });
}

let organizationCreated = false;
try {
  await db.insert(organizations).values({ id: organizationId, name: "Price drop smoke test" });
  organizationCreated = true;
  await db.insert(stores).values({
    id: storeId,
    organizationId,
    code: `PRICE-TEST-${randomUUID().slice(0, 8)}`,
    name: "Loja temporária de teste de preço",
    timeZone: "America/Sao_Paulo",
  });
  await db.insert(organizationMemberships).values({ organizationId, authUserId: managerId, role: "manager" });
  await app.ready();

  const beforeCsv = await readFile(new URL("../fixtures/price-update-before.csv", import.meta.url), "utf8");
  const afterCsv = await readFile(new URL("../fixtures/price-update-after.csv", import.meta.url), "utf8");
  const base = `/v1/stores/${storeId}`;

  const firstImport = await inject({ method: "POST", url: `${base}/imports/products`, headers: { "content-type": "text/csv" }, payload: beforeCsv });
  assert.equal(firstImport.statusCode, 201, "primeiro CSV publica o catálogo inicial");
  const firstRun = firstImport.json() as { syncRunId: string; rowsImported: number; pricesChanged: number };
  assert.equal(firstRun.rowsImported, 2);
  assert.equal(firstRun.pricesChanged, 2, "preços iniciais também ficam registrados como mudanças");

  const secondImport = await inject({ method: "POST", url: `${base}/imports/products`, headers: { "content-type": "text/csv" }, payload: afterCsv });
  assert.equal(secondImport.statusCode, 201, "segundo CSV atualiza o catálogo");
  const secondRun = secondImport.json() as { syncRunId: string; rowsImported: number; pricesChanged: number };
  assert.equal(secondRun.rowsImported, 3);
  assert.equal(secondRun.pricesChanged, 2, "uma queda e um produto novo geram eventos; o preço igual não");

  const changesResponse = await inject({ method: "GET", url: `${base}/price-changes?syncRunId=${secondRun.syncRunId}&limit=100&offset=0` });
  assert.equal(changesResponse.statusCode, 200);
  const changes = (changesResponse.json() as { changes: Array<{ productId: string; productName: string; oldAmount: string | null; newAmount: string }> }).changes;
  assert.equal(changes.length, 2, "o filtro retorna só eventos do segundo CSV");
  const drops = changes.filter((item) => item.oldAmount !== null && Number(item.newAmount) < Number(item.oldAmount));
  assert.equal(drops.length, 1, "apenas o suco aparece como redução; produto novo não conta como queda");
  assert.equal(drops[0]?.productName, "Suco de laranja 1L");
  assert.equal(drops[0]?.oldAmount, "8.99");
  assert.equal(drops[0]?.newAmount, "7.49");

  const product = await db.select({ id: products.id }).from(products)
    .innerJoin(storePrices, eq(storePrices.productId, products.id))
    .where(and(eq(products.organizationId, organizationId), eq(products.name, drops[0]!.productName)))
    .limit(1);
  assert.ok(product[0], "produto reduzido existe no catálogo publicado");

  const labelResponse = await inject({ method: "POST", url: `${base}/labels`, payload: { productId: product[0]!.id } });
  assert.equal(labelResponse.statusCode, 201, "cartaz pode ser criado com o preço publicado");
  const label = (labelResponse.json() as { label: { id: string; displayAmount: string } }).label;
  assert.equal(label.displayAmount, "7.49");

  const batch = await inject({ method: "GET", url: `${base}/labels/print-batch?labelIds=${label.id}&widthMm=210&heightMm=297` });
  assert.equal(batch.statusCode, 200, "API gera impressão do cartaz");
  assert.match(batch.headers["content-type"] ?? "", /text\/html/);
  assert.match(batch.body, /Suco de laranja 1L/);
  assert.match(batch.body, /7,49/);

  console.log("PASS: dois CSVs locais -> redução identificada -> cartaz com preço novo -> HTML de impressão em lote.");
} finally {
  await app.close();
  if (organizationCreated) {
    await db.delete(priceChangeEvents).where(eq(priceChangeEvents.organizationId, organizationId));
    await db.delete(priceLabels).where(eq(priceLabels.organizationId, organizationId));
    await db.delete(organizations).where(eq(organizations.id, organizationId));
  }
  await closeDatabaseConnection();
}
