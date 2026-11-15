import Fastify from "fastify";
import { env } from "./config/env.js";
import { authPlugin } from "./auth/plugin.js";
import { healthRoutes } from "./routes/health.js";

export function buildApp() {
  const allowedOrigins = new Set(env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean));
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    requestIdHeader: "x-request-id",
  });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id");
      reply.header("Access-Control-Expose-Headers", "X-Request-Id");
      reply.header("Access-Control-Max-Age", "600");
      reply.header("Vary", "Origin");
      if (request.method === "OPTIONS") return reply.code(204).send();
    }
  });

  app.register(healthRoutes);
  app.register(authPlugin);

  app.setErrorHandler((error, request, reply) => {
    const reportedStatus = typeof error === "object" && error !== null && "statusCode" in error
      && typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
    const statusCode = reportedStatus >= 400 && reportedStatus < 500
      ? reportedStatus
      : 500;
    const message = error instanceof Error ? error.message : "Ocorreu um erro interno.";

    request.log.error({ err: error, statusCode }, "Request failed");

    return reply.code(statusCode).send({
      error: statusCode === 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR",
      message: statusCode === 500 ? "Ocorreu um erro interno." : message,
      requestId: request.id,
    });
  });

  return app;
}
