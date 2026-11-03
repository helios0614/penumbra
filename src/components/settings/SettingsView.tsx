import { Activity, Palette } from "lucide-react";
import { SettingsAppearance } from "./SettingsAppearance";
import { SettingsShell, type SettingsPage } from "./SettingsShell";
import { SettingsSafeBasics } from "./SettingsSafeBasics";
import { useSettingsOverview } from "./useSettingsOverview";

const pages: readonly SettingsPage[] = [
  { id: "appearance", title: "外观与本机偏好", description: "界面、主题色与桌面壁纸", icon: Palette,
    render: () => <SettingsAppearance /> },
  { id: "system", title: "系统状态", description: "Session、模型目录与新会话默认配置", icon: Activity,
    render: ({ active }) => <SettingsSystemPage active={active} /> },
];

export function SettingsView({ onBack }: { onBack?: () => void }) {
  return <SettingsShell pages={pages} onClose={onBack} />;
}

function SettingsSystemPage({ active }: { active: boolean }) {
  const { state, retry } = useSettingsOverview(active);
  return <SettingsSafeBasics state={state} onRetry={retry} />;
}

export default SettingsView;
