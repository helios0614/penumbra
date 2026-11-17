"""Real Classic/Editorial routes, synthetic HTTP/WS and local PCM audio only.

Run with webapp-testing/scripts/with_server.py (Vite preview on port 45443), then:
  python tests/browser/music-volume-memory-type-smoke.py
Requires Python Playwright and system Chrome; no production service is contacted.
"""
import copy
import io
import json
import math
import os
import struct
import wave
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright, expect

ORIGIN = os.environ.get("E43_SMOKE_ORIGIN", "http://127.0.0.1:45443")
OUTPUT = Path("/private/tmp/penumbra-volume-memory-browser")
OUTPUT.mkdir(exist_ok=True)
appearance = {"version": 1, "themeMode": "light", "themeColor": None, "aiColor": None,
              "wallpaper": {"mode": "ambient", "fit": "cover", "position": "center", "shade": "medium", "textTone": "auto", "image": None},
              "avatars": {"user": None, "assistant": None}, "stickerImage": None, "stickers": []}
sound = io.BytesIO()
with wave.open(sound, "wb") as wav:
    wav.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
    wav.writeframes(b"".join(struct.pack("<h", int(math.sin(i / 8000 * math.pi * 440) * 300)) for i in range(8000 * 30)))


def run(browser, layout, width, mode):
    context = browser.new_context(viewport={"width": width, "height": 844}, is_mobile=width < 768, has_touch=width < 768)
    context.add_init_script("""(() => {
      if(localStorage.getItem('aion_music_volume')===null) localStorage.setItem('aion_music_volume','25');
      const Original = window.Audio;
      window.Audio = function(...args) { const audio = new Original(...args); window.__audio = audio; return audio; };
      window.Audio.prototype = Original.prototype;
    })()""")
    if mode != "web":
        context.add_init_script("""(() => {
          window.AionMusic = {
            getMusicVolume: () => { if(MODE==='broken') throw Error('synthetic unavailable'); return Number(sessionStorage.nativeVolume ?? 55); },
            setMusicVolume: value => { if(MODE==='broken') throw Error('synthetic unavailable'); sessionStorage.nativeVolume=String(value); }
          };
        })()""".replace("MODE", json.dumps(mode)))
    page = context.new_page()
    page.set_default_timeout(12000)
    errors, requests = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route_web_socket("**/ws", lambda ws: None)
    memory = {"id": "m", "content": " \n保持原始正文\n ", "type": "digest", "created_at": 123,
              "source_conv": "original-conversation", "keywords": json.dumps([f"tag-{n}" for n in range(40)]),
              "importance": 0.456, "unresolved": 1, "source_start_ts": 10, "source_end_ts": 20}
    original = copy.deepcopy(memory)
    state = {"fail": False}
    song_name = "合成长歌曲名称，用于窄屏布局验证"
    message = {"id": "song", "conv_id": "a", "role": "assistant", "content": "合成音乐",
               "created_at": 10, "drift": None, "thinking": None, "mcp_tool_calls": [], "is_carryover": 0, "cache_region": None,
               "attachments": [{"type": "music", "id": 42, "name": song_name, "artist": "本机音调"}]}

    def route_request(route):
        request = route.request
        url = urlparse(request.url)
        if not request.url.startswith(ORIGIN):
            return route.abort()
        if not url.path.startswith("/api/"):
            return route.continue_()
        path, method = url.path, request.method
        body = request.post_data_json if request.post_data else None
        requests.append({"path": path, "method": method, "body": body})

        def reply(data, status=200):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(data))

        if path == "/api/session": return reply({"authenticated": True})
        if path == "/api/appearance": return reply(appearance)
        if path == "/api/worldbook": return reply({"ai_name": "合成助手", "user_name": "合成用户"})
        if path == "/api/main/configuration":
            return reply({"connection_selection": {"connection_id": "synthetic", "protocol": "openai_chat_completions", "model": "synthetic"},
                          "selection": None, "diagnostic": None, "allowed_protocols": ["openai_chat_completions"],
                          "connections": [{"id": "synthetic", "name": "合成连接", "transport": "direct", "enabled": True, "default_model": "synthetic", "credential_configured": True}]})
        if path == "/api/chat/readiness": return reply({"ready": True, "model_key": "synthetic", "reason_code": "ready", "setup_action_required": False})
        if path == "/api/memories" and method == "GET":
            return reply({"items": [memory], "page": 1, "page_size": 30, "total": 1, "total_all": 1, "has_more": False})
        if path == "/api/memories/m" and method == "PUT":
            if state["fail"]:
                state["fail"] = False
                return reply({"detail": "合成保存失败：服务暂不可用"}, 503)
            memory.update(body)
            return reply({"ok": True, "id": "m"})
        if path.endswith("/requeue-source"): return reply({"supported": False, "reason": "source_untracked"})
        if path == "/api/conversations":
            return reply([{"id": "a", "title": "合成会话", "model": "legacy", "created_at": 1, "updated_at": 3, "message_count": 1}])
        if path == "/api/conversations/a/messages/window":
            return reply({"conversation_id": "a", "anchor_id": None, "messages": [message], "older_cursor": None, "newer_cursor": None,
                          "has_older": False, "has_newer": False, "reaches_latest": True})
        if path == "/api/music/stream/42": return route.fulfill(content_type="audio/wav", body=sound.getvalue())
        if path == "/api/music/detail/42": return reply({"id": 42, "name": song_name, "artist": "本机音调"})
        return reply({"detail": "Synthetic fixture: unsupported route"}, 404)

    page.route("**/*", route_request)
    prefix = "/penumbra/" + ("editorial/" if layout == "editorial" else "") + "app/"

    def geometry(selector):
        assert page.locator(selector).evaluate("""el => {const r=el.getBoundingClientRect(); return r.left>=-1 && r.right<=innerWidth+1 && r.top>=-1 && r.bottom<=innerHeight+1 && el.scrollWidth<=el.clientWidth+1;}"""), selector

    def editor():
        page.locator('[data-memory-id="m"]').get_by_role("button", name="记忆操作", exact=True).click()
        page.get_by_role("menuitem", name="编辑", exact=True).click()
        dialog = page.get_by_role("dialog", name="编辑记忆", exact=True)
        expect(dialog).to_be_visible()
        return dialog

    try:
        page.goto(ORIGIN + prefix + "chat")
        page.wait_for_load_state("networkidle")
        card = page.locator("[data-music-card]")
        expect(card).to_be_visible()
        volume = card.get_by_role("slider", name="音乐音量：" + song_name, exact=True)
        expect(volume).to_have_attribute("aria-valuenow", "55" if mode == "native" else "25")
        card.get_by_role("button", name="播放 " + song_name, exact=True).click()
        page.wait_for_function("window.__audio && !window.__audio.paused && window.__audio.currentTime > 0")
        expect(card.get_by_role("button", name="暂停 " + song_name, exact=True)).to_be_visible()
        volume.focus()
        page.keyboard.press("Home")
        assert page.evaluate("window.__audio.volume") == 0
        # Inspect actual media volume while the drag is still in progress.
        track = card.locator('[data-slot="slider-control"]')
        rect = track.bounding_box()
        page.mouse.move(rect["x"] + 8, rect["y"] + rect["height"] / 2)
        page.mouse.down()
        page.mouse.move(rect["x"] + rect["width"] * .6, rect["y"] + rect["height"] / 2, steps=8)
        percent = int(volume.get_attribute("aria-valuenow"))
        assert 40 < percent < 80
        assert abs(page.evaluate("window.__audio.volume") - percent / 100) < .001
        assert not page.evaluate("window.__audio.paused")
        page.mouse.up()
        assert page.evaluate("localStorage.aion_music_volume") == str(percent)
        card.get_by_role("button", name="暂停 " + song_name, exact=True).click()
        card.get_by_role("button", name="播放 " + song_name, exact=True).click()
        assert abs(page.evaluate("window.__audio.volume") - percent / 100) < .001
        geometry("[data-music-card]")
        page.screenshot(path=str(OUTPUT / f"music-{layout}-{width}-{mode}.png"))
        page.reload()
        expect(page.get_by_role("slider", name="音乐音量：" + song_name, exact=True)).to_have_attribute("aria-valuenow", str(percent))
        page.get_by_role("button", name="播放 " + song_name, exact=True).click()
        page.wait_for_function("window.__audio && !window.__audio.paused")
        assert abs(page.evaluate("window.__audio.volume") - percent / 100) < .001
        assert not any(r for r in requests if r["method"] != "GET" and "music" in r["path"])

        if mode == "web":
            page.goto(ORIGIN + prefix + "memory")
            page.wait_for_load_state("networkidle")
            dialog = editor()
            expect(dialog.get_by_role("combobox", name="记忆类型", exact=True)).to_contain_text("总结")
            assert "tag-39" in dialog.get_by_role("textbox", name="关键词", exact=True).input_value()
            dialog.get_by_role("combobox", name="记忆类型", exact=True).click()
            page.get_by_role("option", name="约定承诺", exact=True).click()
            state["fail"] = True
            dialog.get_by_role("button", name="保存修改", exact=True).click()
            expect(dialog.get_by_role("alert")).to_contain_text("合成保存失败")
            expect(dialog.get_by_role("combobox", name="记忆类型", exact=True)).to_contain_text("约定承诺")
            assert dialog.get_by_role("textbox", name="正文", exact=True).input_value() == original["content"]
            geometry('[role="dialog"]')
            page.screenshot(path=str(OUTPUT / f"memory-{layout}-{width}.png"))
            page.set_viewport_size({"width": width, "height": 360})
            dialog.get_by_role("button", name="保存修改", exact=True).scroll_into_view_if_needed()
            geometry('[role="dialog"]')
            page.screenshot(path=str(OUTPUT / f"memory-short-{layout}-{width}.png"))
            page.set_viewport_size({"width": width, "height": 844})
            dialog.get_by_role("button", name="保存修改", exact=True).click()
            expect(dialog).not_to_be_visible()
            expect(page.locator('[data-memory-id="m"]')).to_contain_text("约定承诺")
            assert memory == {**original, "type": "promise"}
            writes = [r for r in requests if r["method"] == "PUT"]
            assert all(r["body"] == {"content": original["content"], "type": "promise"} for r in writes)
            assert requests[-1]["method"] == "GET"
            page.reload()
            dialog = editor()
            expect(dialog.get_by_role("combobox", name="记忆类型", exact=True)).to_contain_text("约定承诺")
            dialog.get_by_role("button", name="保存修改", exact=True).click()
            expect(dialog).not_to_be_visible()
            assert [r for r in requests if r["method"] == "PUT"][-1]["body"] == {"content": original["content"]}
            assert memory == {**original, "type": "promise"}
            for legacy in ["future-type", "旧名字总结", None, ""]:
                memory["type"] = legacy
                page.reload()
                dialog = editor()
                expect(dialog.get_by_role("combobox", name="记忆类型", exact=True)).to_contain_text(legacy or "未设置（保留原值）")
                dialog.get_by_role("button", name="保存修改", exact=True).click()
                expect(dialog).not_to_be_visible()
                assert [r for r in requests if r["method"] == "PUT"][-1]["body"] == {"content": original["content"]}
                assert memory == {**original, "type": legacy}
        assert not errors, errors
        print(f"PASS {layout} {width}px {mode}", flush=True)
    except Exception:
        page.screenshot(path=str(OUTPUT / "failure.png"))
        (OUTPUT / "failure.txt").write_text(page.locator("body").inner_text() + "\n" + json.dumps(requests, ensure_ascii=False))
        raise
    finally:
        context.close()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    try:
        for layout in ["classic", "editorial"]:
            for width in [320, 390, 1280]:
                for mode in ["web", "native", "broken"]:
                    run(browser, layout, width, mode)
    finally:
        browser.close()
