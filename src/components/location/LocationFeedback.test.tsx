import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INITIAL_LOCATION_STATE, type LocationState } from "@/application/location/location-state";
import { draftFromConfig } from "@/application/location/location-draft";
import { locationConfig, locationStatus } from "@/domain/location/location-fixtures";
import * as toast from "@/components/ui/toast";
import { LocationPage } from "./LocationView";

const draft = draftFromConfig(locationConfig());
const state: LocationState = { ...INITIAL_LOCATION_STATE, config: locationConfig(), status: locationStatus(), draft, baseline: draft };
afterEach(() => vi.restoreAllMocks());
describe("Location feedback outlets", () => {
  it.each(["key", "position", "settings"] as const)("shows confirmed %s feedback exactly once via Toast", (section) => {
    const feedback = { text: section === "key" ? "Key 已保存" : section === "position" ? "位置参数已保存" : "配置已保存", error: false, section };
    const notify = vi.spyOn(toast, "useFeedbackToast").mockImplementation(() => {});
    const html = renderToStaticMarkup(<LocationPage state={{ ...state, feedback }} controller={null} connection="connected" reconnect={vi.fn()} />);
    expect(notify).toHaveBeenCalledExactlyOnceWith(feedback, { type: "success", text: feedback.text });
    expect(html).not.toContain(feedback.text);
  });
  it("keeps failed saves/uncertainty in the affected form and drafts in persistent feedback", () => {
    const notify = vi.spyOn(toast, "useFeedbackToast").mockImplementation(() => {});
    const feedback = { text: "保存结果尚未确认，草稿已保留", error: true, section: "position" as const };
    const html = renderToStaticMarkup(<LocationPage state={{ ...state, feedback }} controller={null} connection="connected" reconnect={vi.fn()} />);
    expect(notify).toHaveBeenCalledWith(feedback, null); expect(html.match(/保存结果尚未确认，草稿已保留/g)).toHaveLength(1);
    const retained = { text: "显示已更新，未保存的修改已保留。", error: false, persistent: true };
    const dirty = renderToStaticMarkup(<LocationPage state={{ ...state, feedback: retained }} controller={null} connection="connected" reconnect={vi.fn()} />);
    expect(notify).toHaveBeenLastCalledWith(retained, null); expect(dirty).toContain(retained.text);
  });
});
