import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  timeout: 40_000,
  expect: { timeout: 10_000 },
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:5174",
    browserName: "chromium",
    headless: true
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
