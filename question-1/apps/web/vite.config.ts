import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    // Local development talks to localhost; Docker sets VITE_BACKEND_HOST=game.
    proxy: {
      "/ws": {
        target: `ws://${process.env.VITE_BACKEND_HOST ?? "localhost"}:8080`,
        ws: true,
      },
      "/health": `http://${process.env.VITE_BACKEND_HOST ?? "localhost"}:8080`,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
