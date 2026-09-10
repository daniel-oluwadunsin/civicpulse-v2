import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { assertDatabaseReady } from "./db/readiness.js";

async function start() {
  await assertDatabaseReady();
  const app = createApp();
  app.listen(env.PORT, () =>
    console.log(
      JSON.stringify({
        level: "info",
        message: "api listening",
        port: env.PORT,
      }),
    ),
  );
}

start().catch((error) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      message: error instanceof Error ? error.message : "API startup failed.",
    }),
  );
  process.exitCode = 1;
});
