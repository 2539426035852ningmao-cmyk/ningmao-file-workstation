import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({mode}) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { cn: fileURLToPath(new URL("./src/cn.ts", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 1431, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  build: mode==="test" ? { outDir:"dist-test", rollupOptions:{input:"tests/harness.html"} } : { chunkSizeWarningLimit: 800 },
  clearScreen: false,
}));
