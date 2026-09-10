import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "apps/web/e2e-functional",
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:4174",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command:
        "set -a; . ./.env; set +a; DATABASE_URL=\"$TEST_DATABASE_URL\" PORT=4010 WEB_ORIGIN=http://localhost:4174 APP_PUBLIC_URL=http://localhost:4174 API_PUBLIC_URL=http://localhost:4010 SMTP_HOST= SMTP_USER= SMTP_PASS= EMAIL_FROM= npm run dev:api",
      url: "http://localhost:4010/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        "VITE_API_BASE_URL=http://localhost:4010/api/v1 npm exec vite --workspace=@civicpulse/web -- --host 127.0.0.1 --port 4174",
      url: "http://localhost:4174",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
