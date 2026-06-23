import { useState } from "react";
import { CheckCircle2, Loader2, Server, XCircle } from "lucide-react";

import { API_BASE_URL_DISPLAY, ApiError, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";

type TestState = "idle" | "loading" | "success" | "error";

interface TestResult {
  status: TestState;
  message: string;
  response?: unknown;
  checkedAt?: string;
}

const TEST_ENDPOINT = "/api/auth/logout";

export function ApiProxyTestPage() {
  const [result, setResult] = useState<TestResult>({
    status: "idle",
    message: "Ready to test the Vite dev proxy.",
  });

  async function runProxyTest() {
    setResult({
      status: "loading",
      message: `Calling ${TEST_ENDPOINT} through the Vite dev server...`,
    });

    try {
      const response = await apiPost<Record<string, unknown>>(TEST_ENDPOINT);

      setResult({
        status: "success",
        message: "Proxy is reachable. FastAPI returned a successful response.",
        response,
        checkedAt: new Date().toLocaleString(),
      });
    } catch (error) {
      setResult({
        status: "error",
        message:
          error instanceof ApiError
            ? `${error.message} (status ${error.status || "network"})`
            : error instanceof Error
              ? error.message
              : "Unknown proxy test failure",
        response: error instanceof ApiError ? error.data : undefined,
        checkedAt: new Date().toLocaleString(),
      });
    }
  }

  const isLoading = result.status === "loading";
  const isSuccess = result.status === "success";
  const isError = result.status === "error";

  return (
    <main className="min-h-dvh bg-[linear-gradient(160deg,#f8f3ec_0%,#e7f0ef_45%,#f9fbf8_100%)] px-4 py-8 text-foreground dark:bg-[linear-gradient(160deg,#10100f_0%,#18201f_45%,#111110_100%)] sm:px-6">
      <section className="mx-auto flex max-w-2xl flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-foreground text-background shadow-sm">
            <Server className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold leading-tight">AionHome API Proxy Test</h1>
            <p className="text-sm text-muted-foreground">
              Calls an existing FastAPI endpoint through the Vite /api proxy.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-white/70 p-4 shadow-sm backdrop-blur dark:bg-black/35">
          <dl className="grid gap-3 text-sm sm:grid-cols-[140px_1fr]">
            <dt className="text-muted-foreground">Vite route</dt>
            <dd className="font-mono">{TEST_ENDPOINT}</dd>
            <dt className="text-muted-foreground">Backend target</dt>
            <dd className="font-mono">http://127.0.0.1:8080</dd>
            <dt className="text-muted-foreground">Client base</dt>
            <dd className="font-mono">{API_BASE_URL_DISPLAY}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-white/70 p-4 shadow-sm backdrop-blur dark:bg-black/35">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-medium">Connection Check</h2>
              <p className="text-sm text-muted-foreground">
                Uses POST /api/auth/logout because it is already present and auth-exempt.
              </p>
            </div>
            <button
              type="button"
              onClick={runProxyTest}
              disabled={isLoading}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background shadow-sm transition hover:bg-foreground/85 disabled:cursor-not-allowed disabled:opacity-70",
              )}
            >
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
              Run Test
            </button>
          </div>

          <div
            className={cn(
              "mt-4 rounded-md border p-3 text-sm",
              isSuccess && "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100",
              isError && "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100",
              !isSuccess && !isError && "border-border bg-background/60",
            )}
          >
            <div className="flex items-start gap-2">
              {isSuccess ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : null}
              {isError ? <XCircle className="mt-0.5 size-4 shrink-0" /> : null}
              {isLoading ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" /> : null}
              <div className="min-w-0">
                <p>{result.message}</p>
                {result.checkedAt ? (
                  <p className="mt-1 text-xs opacity-75">Checked at {result.checkedAt}</p>
                ) : null}
              </div>
            </div>
          </div>

          {result.response !== undefined ? (
            <pre className="mt-4 max-h-60 overflow-auto rounded-md bg-black/85 p-3 text-xs text-white">
              {JSON.stringify(result.response, null, 2)}
            </pre>
          ) : null}
        </div>
      </section>
    </main>
  );
}
