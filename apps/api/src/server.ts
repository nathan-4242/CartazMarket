import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { closeDatabaseConnection } from "./db/client.js";
import { startAlertScheduler } from "./alert-scheduler.js";

const app = buildApp();
let stopAlertScheduler = () => {};

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  stopAlertScheduler = startAlertScheduler(app.log);
} catch (error) {
  app.log.fatal({ err: error }, "Could not start API server");
  stopAlertScheduler();
  await closeDatabaseConnection();
  process.exitCode = 1;
}

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down API server");
  stopAlertScheduler();
  await app.close();
  await closeDatabaseConnection();
}

process.once("SIGINT", () => {
  void shutdown("SIGINT").catch((error: unknown) => {
    app.log.error({ err: error }, "Graceful shutdown failed");
    process.exitCode = 1;
  });
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM").catch((error: unknown) => {
    app.log.error({ err: error }, "Graceful shutdown failed");
    process.exitCode = 1;
  });
});
