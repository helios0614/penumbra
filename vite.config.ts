import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd());
  const apiProxyTarget = environment.VITE_DEV_PROXY_TARGET?.trim();
  const websocketProxyTarget =
    environment.VITE_DEV_WS_PROXY_TARGET?.trim() || apiProxyTarget;
  const proxy: Record<string, ProxyOptions> = {};

  if (apiProxyTarget) {
    proxy["/api"] = {
      target: apiProxyTarget,
      changeOrigin: true,
      secure: false,
    };
  }

  if (websocketProxyTarget) {
    proxy["/ws"] = {
      target: websocketProxyTarget,
      ws: true,
      changeOrigin: true,
    };
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 3000,
      ...(Object.keys(proxy).length > 0 ? { proxy } : {}),
    },
  };
});
