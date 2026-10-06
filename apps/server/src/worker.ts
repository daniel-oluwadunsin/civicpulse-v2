import { createServer } from "node:http";
import { run } from "graphile-worker";
import { env } from "./config/env.js";
import { taskList } from "./jobs/taskList.js";
import { pool } from "./db/pool.js";
import { assertDatabaseReady } from "./db/readiness.js";

let ready = false;

const healthServer = createServer((req, res) => {
  if (req.url !== "/health" && req.url !== "/health/live") {
    res.writeHead(404);
    res.end();
    return;
  }

  res.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
  res.end(JSON.stringify({ data: { status: ready ? "ok" : "starting" } }));
});

async function startWorker() {
  await assertDatabaseReady();
  await run({
    pgPool: pool,
    taskList,
    concurrency: 3,
    pollInterval: 1000,
    crontab:
      "17 3 * * * cleanup-rate-limits ?max=3&jobKey=cleanup-rate-limits-daily",
  });
  ready = true;
  console.log(JSON.stringify({ level: "info", message: "worker started" }));
}

healthServer.listen(env.PORT, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      level: "info",
      message: "worker health server listening",
      port: env.PORT,
    }),
  );
});

startWorker().catch((error) => {
  healthServer.close(() => {
    console.error(
      JSON.stringify({
        level: "fatal",
        message:
          error instanceof Error ? error.message : "Worker startup failed.",
      }),
    );
    process.exitCode = 1;
  });
});
