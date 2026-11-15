import type { FastifyPluginAsync } from "fastify";
import { checkDatabaseConnection } from "../db/client.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    status: "ok",
    service: "cartazmarket-api",
  }));

  app.get("/ready", async (_request, reply) => {
    try {
      await checkDatabaseConnection();
      return { status: "ready", dependencies: { database: "ok" } };
    } catch (error) {
      app.log.error({ err: error }, "Database readiness check failed");
      return reply.code(503).send({
        status: "not_ready",
        dependencies: { database: "unavailable" },
      });
    }
  });
};
