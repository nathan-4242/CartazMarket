import type { preHandlerHookHandler } from "fastify";
import type { AuthIdentity } from "../auth/types.js";

declare module "fastify" {
  interface FastifyRequest {
    identity: AuthIdentity | null;
  }

  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
  }
}
