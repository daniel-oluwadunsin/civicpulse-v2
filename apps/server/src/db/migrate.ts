import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "graphile-worker";
import { pool } from "./pool.js";
const migrationsDir = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);
async function migrate() {
  await pool.query(
    `create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now())`,
  );
  const names = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const applied = new Set(
    (
      await pool.query<{ filename: string }>(
        "select filename from schema_migrations",
      )
    ).rows.map((row) => row.filename),
  );
  if (process.argv.includes("--status")) {
    console.log(
      names
        .map((name) => `${applied.has(name) ? "applied" : "pending"} ${name}`)
        .join("\n"),
    );
    return;
  }
  for (const name of names) {
    if (applied.has(name)) continue;
    const sql = await readFile(join(migrationsDir, name), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations(filename) values($1)", [
        name,
      ]);
      await client.query("commit");
      console.log(`applied ${name}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  await runMigrations({ connectionString: process.env.DATABASE_URL! });
}
migrate()
  .then(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
