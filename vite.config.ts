import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const AION_HOME_FASTAPI = "http://127.0.0.1:8080";
const AION_HOME_WS = "ws://127.0.0.1:8080";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: AION_HOME_FASTAPI,
        changeOrigin: true,
        secure: false,
      },
      "/ws": {
        target: AION_HOME_WS,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
