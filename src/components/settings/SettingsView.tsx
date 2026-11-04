import { lazy, Suspense } from "react";
import { Activity, Cable, Palette, Workflow } from "lucide-react";
import { SettingsAppearance } from "./SettingsAppearance";
import { SettingsShell, type SettingsPage } from "./SettingsShell";
import { SettingsSafeBasics } from "./SettingsSafeBasics";
import { useSettingsOverview } from "./useSettingsOverview";
const ConnectionsList = lazy(() => import("./connections/ConnectionsList").then(module => ({ default: module.ConnectionsList })));
const FeatureBindingsPage = lazy(() => import("./features/FeatureBindingsPage").then(module => ({ default: module.FeatureBindingsPage })));

export function SettingsView({ onBack }: { onBack?: () => void }) {
  const pages: readonly SettingsPage[] = [
    { id: "appearance", title: "外观与本机偏好", description: "界面、主题色与桌面壁纸", icon: Palette,
      render: () => <SettingsAppearance /> },
    { id: "connections", title: "API 与连接", description: "连接、凭据与单次测试", icon: Cable, layout: "fill",
      render: ({ active }) => active ? <Suspense fallback={<p role="status" className="text-xs">正在读取连接…</p>}><ConnectionsList /></Suspense> : null },
    { id: "features", title: "模型与任务分配", description: "九项功能的模型分配与生效范围", icon: Workflow, layout: "fill",
      render: ({ active, navigate }) => active ? <Suspense fallback={<p role="status" className="text-xs">正在读取功能分配…</p>}><FeatureBindingsPage onManageConnections={() => navigate("connections")} /></Suspense> : null },
    { id: "system", title: "系统状态", description: "Session 与新会话默认配置", icon: Activity,
      render: ({ active }) => <SettingsSystemPage active={active} /> },
  ];
  return <SettingsShell pages={pages} onClose={onBack} />;
}

function SettingsSystemPage({ active }: { active: boolean }) {
  const { state, retry } = useSettingsOverview(active);
  return <SettingsSafeBasics state={state} onRetry={retry} />;
}

export default SettingsView;
