import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SettingsOverview } from "@/application/settings-overview";
import { SettingsSafeBasics } from "@/components/settings/SettingsSafeBasics";
import type { SettingsOverviewState } from "@/components/settings/settings-overview-controller";
import { ApiError } from "@/lib/api";

describe("SettingsSafeBasics", () => {
  it("renders authenticated Session, ready status, ordered read-only models, and active marker", () => {
    const html = render(successState(overview()));

    expect(html).toContain("已登录");
    expect(html).toContain("可发起聊天");
    expect(html).toContain("启动模型");
    expect(html.indexOf("Provider：provider-b")).toBeLessThan(
      html.indexOf("Provider：provider-a"),
    );
    expect(html).toContain("Provider：provider-b");
    expect(html).toContain("只读");
    expect(html).not.toMatch(/<form|<select|保存|修改 Provider/);
  });

  it("renders the safe unauthenticated Session state", () => {
    const value = overview();
    const html = render(successState({
      ...value,
      session: { status: "unauthenticated" },
    }));

    expect(html).toContain("未登录");
    expect(html).toContain("当前 Session 不可用");
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

    expect(html).toContain("尚未就绪");
    expect(html).toContain("future/model with a very long unknown key");
    expect(html).toContain("unknown key 已按后端事实保留");
    expect(html).toContain("需要后续配置");
  });

  it("renders empty models without inventing a default", () => {
    const value = overview();
    const html = render(successState({ ...value, models: [] }));

    expect(html).toContain("暂无可用模型");
    expect(html).toContain("不会补充或选择默认模型");
    expect(html).not.toContain("启动模型");
  });

  it("renders stable loading semantics", () => {
    const html = render({ status: "loading", data: null, error: null });

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("正在加载运行状态");
    expect(html).not.toContain("model-a");
  });

  it("renders a safe 401 error and a keyboard-operable retry button", () => {
    const secret = "Bearer fake-secret https://fake-endpoint.example/v1";
    const error = new ApiError(secret, 401, { secret });
    const html = render({ status: "error", data: null, error });

    expect(html).toContain("Session 不可用");
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

  function render(state: SettingsOverviewState) {
    return renderToStaticMarkup(
      <SettingsSafeBasics state={state} onRetry={vi.fn()} />,
    );
  }
});

function successState(data: SettingsOverview): SettingsOverviewState {
  return { status: "success", data, error: null };
}

function overview(): SettingsOverview {
  return {
    session: { status: "authenticated" },
    models: [
      { key: "model-b", label: "model-b", provider: "provider-b" },
      { key: "model-a", label: "model-a", provider: "provider-a" },
    ],
    readiness: {
      ready: true,
      modelKey: "model-a",
      reason: "ready",
      setupActionRequired: false,
    },
  };
}
