import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

import {
  createDevProxyConfig,
  DEV_PROXY_TARGET_ENV,
} from "./src/config/dev-proxy-config";

export default defineConfig(({ command, mode, isPreview }) => {
  let proxy: Record<string, ProxyOptions> | undefined;
  if (command === "serve" && !isPreview) {
    const environment = loadEnv(mode, process.cwd(), "");
    proxy = createDevProxyConfig(environment[DEV_PROXY_TARGET_ENV]);
  }

  return {
    base: command === "build" || isPreview ? "/penumbra/" : "/",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 3000,
      ...(proxy ? { proxy } : {}),
    },
  };
});
