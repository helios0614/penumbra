import type { ProxyOptions } from "vite";

export const DEV_PROXY_TARGET_ENV = "PENUMBRA_DEV_PROXY_TARGET";

export function parseDevProxyTarget(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate) {
    return undefined;
  }

  let target: URL;
  try {
    target = new URL(candidate);
  } catch {
    throw invalidTarget("must be a valid absolute URL");
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw invalidTarget("must use the http: or https: protocol");
  }
  if (target.username || target.password) {
    throw invalidTarget("must not include username or password");
  }
  if (target.search || target.hash) {
    throw invalidTarget("must not include query parameters or a fragment");
  }
  if (target.pathname !== "/") {
    throw invalidTarget("must contain only an origin, without a path");
  }

  return target.origin;
}

export function createDevProxyConfig(
  value: string | undefined,
): Record<string, ProxyOptions> | undefined {
  const target = parseDevProxyTarget(value);
  if (!target) {
    return undefined;
  }

  const httpProxy: ProxyOptions = {
    target,
    changeOrigin: true,
    secure: true,
  };

  return {
    "/api": { ...httpProxy },
    "/uploads": { ...httpProxy },
    // Explicit legacy settings link only; never proxy the SPA or all /static assets.
    "^/camera(?:\\?|$)": { ...httpProxy },
    "^/static/common\\.(?:css|js)(?:\\?|$)": { ...httpProxy },
    "^/public/(?:AionMonitoralart\\.mp3|icon-192\\.png)(?:\\?|$)": { ...httpProxy },
    "/ws": {
      ...httpProxy,
      ws: true,
    },
  };
}

function invalidTarget(reason: string): Error {
  return new Error(`${DEV_PROXY_TARGET_ENV} ${reason}`);
}
