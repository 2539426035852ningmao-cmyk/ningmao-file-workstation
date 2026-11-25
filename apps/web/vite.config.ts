import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const qrNotices = [
  "./node_modules/qrcode.react/LICENSE",
  "../../licenses/qrcode-react-qrcodegen-MIT.txt",
].map(path => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

export default defineConfig({
  plugins: [react(), {
    name: "qr-license-notices",
    transformIndexHtml: html => html.replace("</head>", `<!--\n${qrNotices}\n-->\n  </head>`),
  }],
  server: { host: "127.0.0.1", port: 5174 },
  build: { outDir: "dist", emptyOutDir: true },

});
