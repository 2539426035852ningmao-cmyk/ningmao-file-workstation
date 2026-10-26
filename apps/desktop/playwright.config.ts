import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir:"./tests/browser",outputDir:process.env.M105_TEST_OUTPUT || "test-results",workers:1,fullyParallel:false,timeout:40_000,
  use:{baseURL:"http://127.0.0.1:1431",viewport:{width:1120,height:760},trace:"off",video:process.env.ORB_VIDEO?{mode:"on",size:{width:640,height:520}}:"off"},
  webServer:{command:"npm run preview -- --outDir dist-test --port 1431",url:"http://127.0.0.1:1431/tests/harness.html",reuseExistingServer:false,timeout:30_000},
  reporter:[["list"]],
});
