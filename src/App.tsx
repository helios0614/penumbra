import { ApiProxyTestPage } from "@/components/dev/ApiProxyTestPage";
import { EditorialDesktop } from "@/components/desktop-v2/EditorialDesktop";
import { Desktop } from "@/widgets/Desktop";
import { ScheduleRuntime } from "@/components/schedule/ScheduleRuntime";
import { lazy, Suspense } from "react";

const ChatMarkdownDevPage = import.meta.env.DEV
  ? lazy(() => import("@/components/dev/ChatMarkdownDevPage")) : null;

export default function App() {
  if (import.meta.env.DEV && ChatMarkdownDevPage && window.location.pathname === "/dev/chat-markdown") {
    return <Suspense fallback={<p>正在加载 Markdown 验收页…</p>}><ChatMarkdownDevPage /></Suspense>;
  }
  if (window.location.pathname === "/proxy-test") {
    return <ApiProxyTestPage />;
  }

  if (
    window.location.pathname === "/editorial" ||
    window.location.pathname.startsWith("/editorial/")
  ) {
    return <ScheduleRuntime><EditorialDesktop /></ScheduleRuntime>;
  }

  return <ScheduleRuntime><Desktop /></ScheduleRuntime>;
}
