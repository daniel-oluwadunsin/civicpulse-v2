import { defineConfig } from "@playwright/test";

const viewports = [
  { name: "mobile", viewport: { width: 390, height: 844 } },
  { name: "tablet", viewport: { width: 768, height: 1024 } },
  { name: "laptop", viewport: { width: 1280, height: 800 } },
  { name: "desktop", viewport: { width: 1440, height: 900 } },
];

export default defineConfig({
  testDir: "apps/web/e2e",
  timeout: 30_000,
  expect: { toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.01 } },
  use: { baseURL: "http://localhost:5173", colorScheme: "light", reducedMotion: "reduce", trace: "retain-on-failure" },
  projects: viewports.map(({ name, viewport }) => ({ name, use: { viewport } })),
  webServer: { command: "npm run dev:web", url: "http://localhost:5173", reuseExistingServer: true, timeout: 120_000 },
});
