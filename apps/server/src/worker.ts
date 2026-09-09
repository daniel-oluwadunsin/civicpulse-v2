import { run } from "graphile-worker";
import { env } from "./config/env.js";
import { taskList } from "./jobs/taskList.js";
run({
  connectionString: env.DATABASE_URL,
  taskList,
  concurrency: 3,
  pollInterval: 1000,
})
  .then(() =>
    console.log(JSON.stringify({ level: "info", message: "worker started" })),
  )
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
