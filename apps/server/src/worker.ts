import { run } from "graphile-worker";
import { env } from "./config/env.js";
import { taskList } from "./jobs/taskList.js";
import { assertDatabaseReady } from "./db/readiness.js";

assertDatabaseReady()
  .then(() =>
    run({
      connectionString: env.DATABASE_URL,
      taskList,
      concurrency: 3,
      pollInterval: 1000,
      crontab:
        "17 3 * * * cleanup-rate-limits ?max=3&jobKey=cleanup-rate-limits-daily",
    }),
  )
  .then(() =>
    console.log(JSON.stringify({ level: "info", message: "worker started" })),
  )
  .catch((error) => {
    console.error(
      JSON.stringify({
        level: "fatal",
        message:
          error instanceof Error ? error.message : "Worker startup failed.",
      }),
    );
    process.exitCode = 1;
  });
