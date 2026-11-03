import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SettingsOverview } from "@/application/settings-overview";
import { SettingsSafeBasics } from "@/components/settings/SettingsSafeBasics";
import { INITIAL_SETTINGS_OVERVIEW_STATE, type SettingsOverviewState } from "@/components/settings/settings-overview-controller";
import { ApiError } from "@/lib/api";

describe("SettingsSafeBasics", () => {
  it("renders independent authenticated Session and default readiness without a catalog", () => {
    const html = render(successState(overview()));
    expect(html).toContain("已登录");
    expect(html).toContain("默认配置就绪");
    expect(html).toContain("只读");
    expect(html).not.toMatch(/模型目录|Provider：|<form|<select/);
  });

  it("renders the safe unauthenticated Session state", () => {
    const value = overview();
    const html = render(successState({
      ...value,
      session: { status: "unauthenticated" },
    }));

    expect(html).toContain("未登录");
    expect(html).toContain("Session 可达 · 未登录");
  });

  it("renders unavailable readiness and preserves an unknown model key", () => {
    const value = overview();
    const html = render(successState({
      ...value,
      readiness: {
        ready: false,
        modelKey: "future/model with a very long unknown key",
        reason: "unknown-model",
        setupActionRequired: true,
      },
    }));

    expect(html).toContain("默认配置尚未就绪");
    expect(html).toContain("future/model with a very long unknown key");
    expect(html).toContain("需要后续配置");
  });

  it("renders stable loading semantics", () => {
    const html = render(INITIAL_SETTINGS_OVERVIEW_STATE);

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("正在加载运行状态");
    expect(html).not.toContain("model-a");
  });

  it("renders a safe 401 error and a keyboard-operable retry button", () => {
    const secret = "Bearer fake-secret https://fake-endpoint.example/v1";
    const error = new ApiError(secret, 401, { secret });
    const html = render({ ...INITIAL_SETTINGS_OVERVIEW_STATE, session: { status: "error", data: null, error } });

    expect(html).toContain("此项读取未获授权");
    expect(html).toContain("后端已响应");
    expect(html).toContain('type="button"');
    expect(html).toContain("重试");
    expect(html).not.toContain(secret);
  });

  it("never renders extra secret, endpoint, cookie, config, or provider payload fields", () => {
    const forbidden = [
      "fake-api-key",
      "fake-authorization",
      "https://fake-provider-endpoint.example/v1",
      "fake-cookie",
      "fake-config",
      "fake-provider-payload",
    ];
    const unsafe = {
      ...overview(),
      apiKey: forbidden[0],
      authorization: forbidden[1],
      endpoint: forbidden[2],
      cookie: forbidden[3],
      config: forbidden[4],
      providerPayload: forbidden[5],
    } as SettingsOverview;
    const html = render(successState(unsafe));

    forbidden.forEach((value) => expect(html).not.toContain(value));
    expect(html).not.toContain("raw JSON");
  });

  it.each([
    ["ready", "新会话默认配置已就绪"],
    ["unknown-model", "默认模型无法识别"],
    ["provider-not-configured", "服务配置尚未就绪"],
    ["configuration-invalid", "新会话默认配置无效"],
    ["invalid_connection", "默认连接无效"], ["invalid_profile", "默认连接配置无效"],
    ["main_selection_required", "需要选择"], ["feature_binding_required", "默认模型分配"],
    ["literal_model_required", "缺少有效的模型名称"],
    ["duplicate_main_selection", "重复选择"], ["conflicting_main_selection", "存在冲突"],
    ["missing_base_url", "缺少服务地址"], ["invalid_base_url", "服务地址无效"],
    ["invalid_registry_configuration", "配置目录无效"], ["malformed_api_configs", "历史连接配置格式无效"],
    ["missing_credential", "缺少凭据"], ["disabled_profile", "已禁用"],
    ["invalid_main_selection", "选择无效"], ["incompatible_protocol", "协议不兼容"],
    ["main_default_not_selected", "尚未选择"], ["missing_profile", "无法找到"],
    ["future_safe_code", "检查连接与模型配置后重试"], ["constructor", "检查连接与模型配置后重试"],
    ["__proto__", "检查连接与模型配置后重试"],
  ])("renders safe readiness copy for %s", (reason, copy) => {
    const value = overview();
    const html = render(successState({ ...value, readiness: { ...value.readiness, ready: false, reason } }));
    expect(html).toContain(copy);
    expect(html).not.toMatch(/后端离线|后端暂时不可达|function Object/);
  });

  it.each(["session", "readiness"] as const)("isolates %s errors and retains the other results", section => {
    const state = successState(overview());
    const html = render({ ...state, [section]: { status: "error", data: null, error: new ApiError("fake-secret", 503) } });
    expect(html).toContain("无法读取此项状态");
    if (section !== "session") expect(html).toContain("已登录");
    if (section !== "readiness") expect(html).toContain("默认配置就绪");
    expect(html).not.toContain("fake-secret");
  });

  it("distinguishes unsupported generation from an invalid configuration", () => {
    const value = overview();
    const html = render(successState({ ...value, readiness: { ...value.readiness, ready: false, reason: "configuration-invalid", generationUnsupported: true } }));
    expect(html).toContain("不支持聊天生成");
  });

  function render(state: SettingsOverviewState) {
    return renderToStaticMarkup(
      <SettingsSafeBasics state={state} onRetry={vi.fn()} />,
    );
  }
});

function successState(data: SettingsOverview): SettingsOverviewState {
  return {
    session: { status: "success", data: data.session, error: null },
    readiness: { status: "success", data: data.readiness, error: null },
  };
}

function overview(): SettingsOverview {
  return {
    session: { status: "authenticated" },
    readiness: {
      ready: true,
      modelKey: "model-a",
      reason: "ready",
      setupActionRequired: false,
    },
  };
}
