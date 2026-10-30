import { EditorialDesktop } from "@/components/desktop-v2/EditorialDesktop";
import { Desktop } from "@/widgets/Desktop";
import { ScheduleRuntime } from "@/components/schedule/ScheduleRuntime";
import { lazy, Suspense } from "react";
import { getAppPathname } from "@/lib/app-paths";

const ApiProxyTestPage = import.meta.env.DEV
  ? lazy(() => import("@/components/dev/ApiProxyTestPage").then(module => ({ default: module.ApiProxyTestPage }))) : null;

const ChatMarkdownDevPage = import.meta.env.DEV
  ? lazy(() => import("@/components/dev/ChatMarkdownDevPage")) : null;

export default function App() {
  const pathname = getAppPathname(window.location.pathname);
  if (import.meta.env.DEV && ChatMarkdownDevPage && pathname === "/dev/chat-markdown") {
    return <Suspense fallback={<p>正在加载 Markdown 验收页…</p>}><ChatMarkdownDevPage /></Suspense>;
  }
  if (import.meta.env.DEV && ApiProxyTestPage && pathname === "/proxy-test") {
    return <Suspense fallback={<p>正在加载代理测试页…</p>}><ApiProxyTestPage /></Suspense>;
  }

  if (
    pathname === "/editorial" ||
    pathname?.startsWith("/editorial/")
  ) {
    return <ScheduleRuntime><EditorialDesktop /></ScheduleRuntime>;
  }

  return <ScheduleRuntime><Desktop /></ScheduleRuntime>;
}
