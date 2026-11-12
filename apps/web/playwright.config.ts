import {defineConfig} from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {baseURL:"http://127.0.0.1:5174",browserName:"chromium",headless:true,viewport:{width:1280,height:800}},
  webServer: {
    command:"npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
    url:"http://127.0.0.1:5174/",
    timeout:60_000,
    reuseExistingServer:!process.env.CI
  }
});
