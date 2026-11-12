import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  // A repository Pages URL is a subpath; local development remains at /.
  base: command === "build" ? "/ningmao-file-workstation/" : "/",
  plugins: [react()],
  server: {host: "127.0.0.1"},
}));
