import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const migrationsDirectory = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);

export async function assertDatabaseReady() {
  const expected = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const table = await pool.query<{ name: string | null }>(
    "select to_regclass('public.schema_migrations')::text name",
  );
  if (!table.rows[0]?.name) {
    throw new Error(
      "Database migrations have not been applied. Run `npm run db:migrate` before starting CivicPulse.",
    );
  }
  const applied = new Set(
    (
      await pool.query<{ filename: string }>(
        "select filename from schema_migrations",
      )
    ).rows.map((row) => row.filename),
  );
  const pending = expected.filter((name) => !applied.has(name));
  if (pending.length) {
    throw new Error(
      `Database migrations are pending: ${pending.join(", ")}. Run \`npm run db:migrate\` before starting CivicPulse.`,
    );
  }
}
