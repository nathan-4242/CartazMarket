import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { env } from "../src/config/env.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(scriptDirectory, "..", "migrations");
const migrationPattern = /^\d{4}_[a-z0-9_]+\.sql$/;

const client = new Client({
  connectionString: env.DATABASE_URL,
  application_name: "cartazmarket-migrations",
});

await client.connect();

try {
  await client.query("select pg_advisory_lock(hashtext('cartazmarket:migrations'))");
  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => migrationPattern.test(filename))
    .sort();

  for (const filename of filenames) {
    const sql = await readFile(join(migrationsDirectory, filename), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query<{ checksum: string }>(
      "select checksum from schema_migrations where name = $1",
      [filename],
    );

    if (existing.rowCount) {
      if (existing.rows[0]?.checksum !== checksum) {
        throw new Error(`Migration já aplicada foi alterada: ${filename}`);
      }
      continue;
    }

    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        "insert into schema_migrations (name, checksum) values ($1, $2)",
        [filename, checksum],
      );
      await client.query("commit");
      console.info(`Aplicada: ${filename}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  console.info(`Migrações verificadas: ${filenames.length}`);
} finally {
  await client.query("select pg_advisory_unlock(hashtext('cartazmarket:migrations'))");
  await client.end();
}
