import { useState } from "react";
import { Activity, Cable, Palette } from "lucide-react";
import { SettingsAppearance } from "./SettingsAppearance";
import { SettingsShell, type SettingsPage } from "./SettingsShell";
import { SettingsSafeBasics } from "./SettingsSafeBasics";
import { useSettingsOverview } from "./useSettingsOverview";
import { ConnectionsList } from "./connections/ConnectionsList";
import { ConnectionDetail } from "./connections/ConnectionDetail";

export function SettingsView({ onBack }: { onBack?: () => void }) {
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const pages: readonly SettingsPage[] = [
    { id: "appearance", title: "外观与本机偏好", description: "界面、主题色与桌面壁纸", icon: Palette,
      render: () => <SettingsAppearance /> },
    { id: "connections", title: "API 与连接", description: "连接、凭据与单次测试", icon: Cable,
      render: ({ active, navigate }) => active ? <ConnectionsList onOpen={id => { setConnectionId(id); navigate("connection-detail"); }} /> : null },
    { id: "connection-detail", title: connectionId ? "连接详情" : "新增连接", description: "共享连接管理，不修改已有模型分配", icon: Cable, nested: true, parentId: "connections",
      render: ({ active, goBack }) => active ? <ConnectionDetail key={connectionId ?? "new"} id={connectionId} onBack={goBack} onCreated={setConnectionId} /> : null },
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
