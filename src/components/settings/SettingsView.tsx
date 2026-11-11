import { lazy, Suspense } from "react";
import { Cable, Database, Globe, Mic, Music, Palette, SlidersHorizontal, Workflow, Plug } from "lucide-react";
import { SettingsAdvanced } from "./SettingsAdvanced";
import { SettingsAppearance } from "./SettingsAppearance";
import { SettingsShell, type SettingsPage } from "./SettingsShell";
const ConnectionsList = lazy(() => import("./connections/ConnectionsList").then(module => ({ default: module.ConnectionsList })));
const FeatureBindingsPage = lazy(() => import("./features/FeatureBindingsPage").then(module => ({ default: module.FeatureBindingsPage })));

const WebSettingsPage = lazy(() => import("./web/WebSettingsPage").then(module => ({ default: module.WebSettingsPage })));
const SpeechSettingsPage = lazy(() => import("./speech/SpeechSettingsPage").then(module => ({ default: module.SpeechSettingsPage })));
const MusicSettingsPage = lazy(() => import("./music/MusicSettingsPage").then(module => ({ default: module.MusicSettingsPage })));
const EmbeddingSettingsPage = lazy(() => import("./embedding/EmbeddingSettingsPage").then(module => ({ default: module.EmbeddingSettingsPage })));
const MCPPage = lazy(() => import("./mcp/MCPPage").then(module => ({ default: module.MCPPage })));

export function SettingsView({ onBack }: { onBack?: () => void }) {
  const pages: readonly SettingsPage[] = [
    { id: "appearance", title: "外观", description: "主题、头像与桌面壁纸", icon: Palette,
      render: () => <SettingsAppearance /> },
    { id: "connections", title: "API 与连接", description: "连接、凭据与单次测试", icon: Cable, layout: "fill",
      render: ({ active }) => active ? <Suspense fallback={<p role="status" className="text-xs">正在读取连接…</p>}>
        <ConnectionsList />
      </Suspense> : null },
    { id: "features", title: "模型与任务分配", description: "九项功能的模型分配与生效范围", icon: Workflow, layout: "fill",
      render: ({ active, navigate, previousPageId }) => active ? <Suspense fallback={<p role="status" className="text-xs">正在读取功能分配…</p>}><FeatureBindingsPage onManageConnections={() => navigate("connections")} focusUsage={previousPageId === "web" ? "web_compression" : undefined} /></Suspense> : null },
    { id: "mcp", title: "MCP 服务", description: "服务器、凭据、工具与高级设置", icon: Plug, layout: "fill",
      render: ({ active }) => active ? <Suspense fallback={<p role="status" className="text-xs">正在读取 MCP…</p>}><MCPPage /></Suspense> : null },
    { id: "advanced", title: "高级设置", description: "缓存配置与服务端保活", icon: SlidersHorizontal,
      render: ({ active }) => active ? <SettingsAdvanced /> : null },
    { id: "web", title: "Web 服务", description: "联网访问、搜索凭据与网页内容压缩", icon: Globe, group: "服务集成",
      render: ({ active, navigate }) => active ? <Suspense fallback={<p role="status" className="text-xs">正在打开 Web 服务…</p>}>
        <WebSettingsPage onManageCompression={() => navigate("features")} />
      </Suspense> : null },
    { id: "speech", title: "语音服务", description: "语音合成与语音识别配置", icon: Mic, group: "服务集成",
      render: ({ active }) => active ? <Suspense fallback={<p role="status" className="text-xs">正在打开语音服务…</p>}>
        <SpeechSettingsPage />
      </Suspense> : null },
    { id: "music", title: "Music 服务", description: "网易云音乐凭据与最近登录结果", icon: Music, group: "服务集成",
      render: ({ active }) => active ? <Suspense fallback={<p role="status" className="text-xs">正在打开 Music 服务…</p>}>
        <MusicSettingsPage />
      </Suspense> : null },
    { id: "embedding", title: "Embedding 服务", description: "API 地址、只读模型与凭据", icon: Database, group: "服务集成",
      render: ({ active }) => active ? <Suspense fallback={<p role="status" className="text-xs">正在打开 Embedding 服务…</p>}>
        <EmbeddingSettingsPage />
      </Suspense> : null },
  ];
  return <SettingsShell pages={pages} onClose={onBack} />;
}

export default SettingsView;
