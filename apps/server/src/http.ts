import { createApp } from "./app.js";
import { env } from "./config/env.js";
const app = createApp();
app.listen(env.PORT, () =>
  console.log(
    JSON.stringify({ level: "info", message: "api listening", port: env.PORT }),
  ),
);
