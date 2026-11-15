import type { FastifyPluginAsync } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { organizationMemberships, organizations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { catalogImportRoutes } from "../imports/catalog-routes.js";
import { catalogRoutes } from "../catalog/routes.js";
import { labelRoutes } from "../labels/routes.js";
import { promotionRoutes } from "../promotions/routes.js";
import { historyRoutes } from "../routes/history.js";
import { alertRoutes } from "../routes/alerts.js";

const userIdSchema = z.uuid();
const supabaseUrl = env.SUPABASE_URL ? new URL(env.SUPABASE_URL) : null;
const issuer = supabaseUrl ? new URL("/auth/v1", supabaseUrl).toString().replace(/\/$/, "") : null;
const jwks = supabaseUrl
  ? createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", supabaseUrl), {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
    })
  : null;

export const authPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest("identity", null);

  app.decorate("authenticate", async (request, reply) => {
    if (!jwks || !issuer) {
      return reply.code(503).send({
        error: "AUTH_NOT_CONFIGURED",
        message: "A autenticação ainda não foi configurada neste ambiente.",
        requestId: request.id,
      });
    }

    const authorization = request.headers.authorization;
    const bearerToken = authorization?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    if (!bearerToken) {
      return reply.code(401).send({
        error: "UNAUTHENTICATED",
        message: "Envie um token de acesso válido.",
        requestId: request.id,
      });
    }

    try {
      const { payload } = await jwtVerify(bearerToken, jwks, {
        issuer,
        audience: "authenticated",
        algorithms: ["ES256", "RS256", "EdDSA"],
        requiredClaims: ["sub"],
      });

      const userId = userIdSchema.safeParse(payload.sub);
      if (!userId.success) {
        return reply.code(401).send({
          error: "INVALID_TOKEN",
          message: "O token não contém uma identidade válida.",
          requestId: request.id,
        });
      }

      request.identity = {
        userId: userId.data,
        email: typeof payload.email === "string" ? payload.email : null,
      };
    } catch {
      return reply.code(401).send({
        error: "INVALID_TOKEN",
        message: "O token é inválido ou expirou.",
        requestId: request.id,
      });
    }
  });

  app.get("/v1/me", { preHandler: app.authenticate }, async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.code(401).send({ error: "UNAUTHENTICATED", requestId: request.id });
    }

    const memberships = await db
      .select({
        organizationId: organizations.id,
        organizationName: organizations.name,
        role: organizationMemberships.role,
      })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
      .where(eq(organizationMemberships.authUserId, identity.userId));

    return {
      user: identity,
      organizations: memberships,
    };
  });

  app.register(catalogImportRoutes);
  app.register(catalogRoutes);
  app.register(promotionRoutes);
  app.register(labelRoutes);
  app.register(historyRoutes);
  app.register(alertRoutes);
};
