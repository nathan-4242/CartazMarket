import type { FastifyBaseLogger } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "./db/client.js";

const SCAN_INTERVAL_MS = 15_000;

async function createAndResolveDueAlerts(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cartazmarket:label-removal-alerts'))`);

    await tx.execute(sql`
      insert into store_alerts (organization_id, store_id, label_id, alert_type, status)
      select organization_id, store_id, id, 'label_removal_due', 'unread'
      from price_labels
      where status = 'printed'
        and removal_due_at is not null
        and removal_due_at <= now()
      on conflict (alert_type, label_id) do nothing
    `);

    await tx.execute(sql`
      update store_alerts as alert
      set status = 'resolved',
          resolved_at = coalesce(alert.resolved_at, now())
      from price_labels as label
      where label.id = alert.label_id
        and label.organization_id = alert.organization_id
        and label.store_id = alert.store_id
        and label.status = 'removed'
        and alert.status <> 'resolved'
    `);
  });
}

export function startAlertScheduler(logger: FastifyBaseLogger): () => void {
  let running = false;
  const scan = async () => {
    if (running) return;
    running = true;
    try {
      await createAndResolveDueAlerts();
    } catch (error) {
      logger.error({ err: error }, "Label removal alert scan failed");
    } finally {
      running = false;
    }
  };

  void scan();
  const timer = setInterval(() => void scan(), SCAN_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
