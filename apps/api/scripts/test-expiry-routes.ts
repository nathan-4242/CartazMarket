import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify, { type InjectOptions } from "fastify";
import { and, eq } from "drizzle-orm";
import { expiryRoutes } from "../src/expiry/routes.js";
import { db, closeDatabaseConnection } from "../src/db/client.js";
import { env } from "../src/config/env.js";
import { organizationMemberships, organizations, productExpiryAlerts, productExpiryLots, products, storePrices, stores } from "../src/db/schema.js";

const databaseHost = new URL(env.DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
  throw new Error("Este teste só pode rodar contra um PostgreSQL local; DATABASE_URL não aponta para localhost.");
}

const organizationId = randomUUID();
const storeId = randomUUID();
const productId = randomUUID();
const managerId = randomUUID();
const operatorId = randomUUID();
const storeCode = `EXPIRY-TEST-${randomUUID().slice(0, 8)}`;
const app = Fastify();

app.decorateRequest("identity", null);
app.decorate("authenticate", async (request, reply) => {
  const userId = request.headers["x-expiry-test-user"];
  if (typeof userId !== "string" || !([managerId, operatorId] as string[]).includes(userId)) {
    return reply.code(401).send({ error: "UNAUTHENTICATED" });
  }
  request.identity = { userId, email: null };
});
app.register(expiryRoutes);

function headers(userId: string) {
  return { "x-expiry-test-user": userId };
}

async function request(method: "GET" | "POST", url: string, userId: string, payload?: unknown) {
  const options: InjectOptions = {
    method,
    url,
    headers: headers(userId),
  };
  if (payload !== undefined) options.payload = payload as NonNullable<InjectOptions["payload"]>;
  return app.inject(options);
}

let organizationCreated = false;

try {
  await db.insert(organizations).values({ id: organizationId, name: "Expiry route test" });
  organizationCreated = true;
  await db.insert(stores).values({
    id: storeId,
    organizationId,
    code: storeCode,
    name: "Loja temporária de teste",
    timeZone: "America/Sao_Paulo",
  });
  await db.insert(organizationMemberships).values([
    { organizationId, authUserId: managerId, role: "manager" },
    { organizationId, authUserId: operatorId, role: "operator" },
  ]);
  await db.insert(products).values({
    id: productId,
    organizationId,
    name: "Produto temporário de vencimento",
    unit: "UN",
  });
  await db.insert(storePrices).values({ organizationId, storeId, productId, amount: "12.50" });
  await app.ready();

  const base = `/v1/stores/${storeId}`;
  const expiresOn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const forbiddenCreate = await request("POST", `${base}/expiry-lots`, operatorId, { productId, expiresOn });
  assert.equal(forbiddenCreate.statusCode, 403, "operador não pode cadastrar lote");

  const invalidQuantity = await request("POST", `${base}/expiry-lots`, managerId, {
    productId,
    expiresOn,
    remainingQuantity: "-1",
  });
  assert.equal(invalidQuantity.statusCode, 400, "quantidade negativa é rejeitada");

  const create = await request("POST", `${base}/expiry-lots`, managerId, {
    productId,
    lotCode: "LOTE-TESTE-1",
    expiresOn,
    remainingQuantity: "4.500",
  });
  assert.equal(create.statusCode, 201, "gerente cadastra lote");
  const createdLot = create.json().lot as { id: string; productName: string; unit: string; status: string };
  assert.equal(createdLot.productName, "Produto temporário de vencimento");
  assert.equal(createdLot.unit, "UN");
  assert.equal(createdLot.status, "active");

  const list = await request("GET", `${base}/expiry-lots?status=active`, operatorId);
  assert.equal(list.statusCode, 200, "operador pode consultar lotes");
  assert.ok(list.json().lots.some((lot: { id: string }) => lot.id === createdLot.id));

  const [alert] = await db.insert(productExpiryAlerts).values({
    organizationId,
    storeId,
    lotId: createdLot.id,
    alertType: "30_day",
    status: "unread",
  }).returning({ id: productExpiryAlerts.id });

  const alertList = await request("GET", `${base}/expiry-alerts?status=unread`, operatorId);
  assert.equal(alertList.statusCode, 200, "operador pode consultar alertas");
  assert.ok(alertList.json().alerts.some((item: { id: string }) => item.id === alert!.id));

  const markRead = await request("POST", `${base}/expiry-alerts/${alert!.id}/read`, operatorId);
  assert.equal(markRead.statusCode, 200);
  assert.equal(markRead.json().alert.status, "read");

  const forbiddenReview = await request("POST", `${base}/expiry-lots/${createdLot.id}/review`, operatorId, { action: "discount" });
  assert.equal(forbiddenReview.statusCode, 403, "operador não pode revisar lote");

  const review = await request("POST", `${base}/expiry-lots/${createdLot.id}/review`, managerId, {
    action: "discount",
    remainingQuantity: "2.125",
    note: "Conferido durante o teste local",
  });
  assert.equal(review.statusCode, 200, "gerente registra revisão do lote");
  assert.equal(review.json().lot.remainingQuantity, "2.125");
  assert.equal(review.json().lot.status, "active", "desconto não encerra o lote");

  const [resolvedAlert] = await db.select({ status: productExpiryAlerts.status })
    .from(productExpiryAlerts)
    .where(and(eq(productExpiryAlerts.id, alert!.id), eq(productExpiryAlerts.storeId, storeId)))
    .limit(1);
  assert.equal(resolvedAlert?.status, "resolved", "revisar lote resolve alertas atuais");

  const closed = await request("POST", `${base}/expiry-lots/${createdLot.id}/review`, managerId, { action: "sold_out" });
  assert.equal(closed.statusCode, 200);
  assert.equal(closed.json().lot.status, "closed");
  assert.equal(closed.json().lot.remainingQuantity, "0.000");

  const activeList = await request("GET", `${base}/expiry-lots?status=active`, managerId);
  assert.ok(!activeList.json().lots.some((lot: { id: string }) => lot.id === createdLot.id));
  const closedList = await request("GET", `${base}/expiry-lots?status=closed`, managerId);
  assert.ok(closedList.json().lots.some((lot: { id: string }) => lot.id === createdLot.id));

  const invalidRead = await request("POST", `${base}/expiry-alerts/${alert!.id}/read`, operatorId);
  assert.equal(invalidRead.statusCode, 409, "alerta resolvido não volta para lido");

  console.log("PASS: expiry lot routes, role permissions, validation, alert read, review, quantity update and lot closure.");
} finally {
  await app.close();
  if (organizationCreated) {
    await db.delete(organizations).where(eq(organizations.id, organizationId));
  }
  await closeDatabaseConnection();
}
