import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  outputDir: process.env.M103_TEST_OUTPUT || "test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:1430", viewport: { width: 1120, height: 760 }, trace: "off" },
  webServer: { command: "npm run preview -- --port 1430", url: "http://127.0.0.1:1430", reuseExistingServer: false, timeout: 30_000 },
  reporter: [["list"]],
});
