"""Production routes + synthetic provider/CDN failures; no real user data."""
import io
import json
import os
import wave
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ORIGIN = os.environ.get("E43_SMOKE_ORIGIN", "http://127.0.0.1:45443")
OUTPUT = Path("/private/tmp/music-playback-stability-browser")
OUTPUT.mkdir(exist_ok=True)
audio = io.BytesIO()
with wave.open(audio, "wb") as wav:
    wav.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
    wav.writeframes(b"\0\0" * 8000 * 15)


def run(browser, layout, width):
    context = browser.new_context(viewport={"width": width, "height": 844}, is_mobile=width < 768, has_touch=width < 768)
    context.add_init_script("""(() => {
      localStorage.setItem('aion_music_volume', '25');
      window.AionMusic={getMusicVolume:()=>{throw Error('synthetic bridge unavailable');},setMusicVolume:()=>{throw Error('synthetic bridge unavailable');}};
      const Original=Audio;window.Audio=function(...args){const audio=new Original(...args);window.__audio=audio;return audio;};window.Audio.prototype=Original.prototype;
    })()""")
    page = context.new_page()
    page.set_default_timeout(12000)
    errors, requests = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route_web_socket("**/ws", lambda ws: None)
    state = {"mode": "link"}
    title = "保持歌曲信息与手动重试"
    selection = {"connection_id": "synthetic", "protocol": "openai_chat_completions", "model": "synthetic"}
    appearance = {"version": 1, "themeMode": "light", "themeColor": None, "aiColor": None,
                  "wallpaper": {"mode": "ambient", "fit": "cover", "position": "center", "shade": "medium", "textTone": "auto", "image": None},
                  "avatars": {"user": None, "assistant": None}, "stickerImage": None, "stickers": []}
    message = {"id": "song", "conv_id": "a", "role": "assistant", "content": "合成音乐", "created_at": 10,
               "drift": None, "thinking": None, "mcp_tool_calls": [], "is_carryover": 0, "cache_region": None,
               "attachments": [{"type": "music", "id": 42, "name": title, "artist": "合成歌手"}]}

    def handle(route):
        request = route.request
        parsed = urlparse(request.url)
        if not request.url.startswith(ORIGIN): return route.abort()
        if not parsed.path.startswith("/api/"): return route.continue_()
        path = parsed.path
        requests.append({"path": path, "query": parsed.query, "range": request.headers.get("range")})

        def reply(body, status=200):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(body))

        if path == "/api/appearance": return reply(appearance)
        if path == "/api/session": return reply({"authenticated": True})
        if path == "/api/worldbook": return reply({"ai_name": "合成助手", "user_name": "合成用户"})
        if path == "/api/music/auth-status": return reply({"mode": "credential", "status": "success", "checked_at": "2026-11-17T00:00:00Z", "error_code": None})
        if path == "/api/main/configuration":
            return reply({"connection_selection": selection, "selection": None, "diagnostic": None, "allowed_protocols": ["openai_chat_completions"],
                          "connections": [{"id": "synthetic", "name": "合成连接", "transport": "direct", "enabled": True, "default_model": "synthetic", "credential_configured": True}]})
        if path == "/api/chat/readiness": return reply({"ready": True, "model_key": "synthetic", "reason_code": "ready", "setup_action_required": False})
        if path == "/api/conversations": return reply([{"id": "a", "title": "合成会话", "model": "legacy", "created_at": 1, "updated_at": 3, "message_count": 1}])
        if path == "/api/conversations/a/messages/window":
            return reply({"conversation_id": "a", "anchor_id": None, "messages": [message], "older_cursor": None, "newer_cursor": None,
                          "has_older": False, "has_newer": False, "reaches_latest": True})
        if path == "/api/music/detail/42":
            assert parsed.query == "include_audio_url=false"
            return reply({"id": 42, "name": title, "album": "元信息保留"})
        if path == "/api/music/stream/42":
            if state["mode"] == "link": return reply({"error": "unavailable", "code": "music_url_unavailable"}, 404)
            if state["mode"] == "forbidden": return reply({"error": "forbidden", "code": "music_resource_forbidden"}, 403)
            if state["mode"] == "service": return reply({"error": "provider request failed", "code": "music_url_request_failed"}, 502)
            if state["mode"] == "decode" and request.headers.get("range") != "bytes=0-0":
                return route.fulfill(content_type="audio/wav", body=b"invalid synthetic audio")
            return route.fulfill(content_type="audio/wav", body=audio.getvalue())
        return reply({"detail": "Synthetic unsupported route"}, 404)

    page.route("**/*", handle)
    url = ORIGIN + "/penumbra/" + ("editorial/" if layout == "editorial" else "") + "app/chat"
    card = page.locator("[data-music-card]")
    play = lambda: card.get_by_role("button", name="播放 " + title, exact=True).click()
    retry = lambda: card.get_by_role("button", name="重试播放 " + title, exact=True).click()
    streams = lambda: [r for r in requests if r["path"] == "/api/music/stream/42"]
    try:
        page.goto(url)
        page.wait_for_load_state("networkidle")
        play()
        expect(card.get_by_role("alert")).to_contain_text("播放链接获取失败")
        expect(card).to_contain_text(title)
        expect(card).to_contain_text("元信息保留")
        count = len(streams())
        assert count == 2 and sum(r["range"] == "bytes=0-0" for r in streams()) == 1
        page.wait_for_timeout(250)
        assert len(streams()) == count  # No automatic playback retries.
        state["mode"] = "ok"
        retry()
        page.wait_for_function("window.__audio?.currentTime>0 && !window.__audio.paused")
        expect(card.get_by_role("button", name="暂停 " + title, exact=True)).to_be_visible()
        slider = card.get_by_role("slider", name="音乐音量：" + title, exact=True)
        slider.focus()
        page.keyboard.press("End")
        assert page.evaluate("window.__audio.volume") == 1
        assert page.evaluate("localStorage.aion_music_volume") == "100"
        assert card.locator('[data-slot="slider-track"]').evaluate("el=>getComputedStyle(el).height") == "3px"
        assert card.locator('[data-slot="slider-thumb"]').evaluate("el=>getComputedStyle(el).width") == "10px"
        assert card.locator('[data-slot="slider-control"]').bounding_box()["height"] >= 44
        assert card.locator('.music-result-volume').evaluate("""el=>{
          const centers=[el.firstElementChild,el.querySelector('[data-slot="slider-control"]'),el.lastElementChild].map(n=>{const r=n.getBoundingClientRect();return r.top+r.height/2;});
          return Math.max(...centers)-Math.min(...centers)<1;
        }""")
        page.screenshot(path=str(OUTPUT / f"playing-{layout}-{width}.png"))
        for mode, expected in [("forbidden", "音频资源拒绝访问"), ("service", "音乐服务请求未能完成"), ("decode", "当前链接检查可用")]:
            state["mode"] = mode
            page.reload()
            play()
            expect(card.get_by_role("alert")).to_contain_text(expected)
            assert "请检查登录" not in card.inner_text()
            expect(card.get_by_role("button", name="重试播放 " + title, exact=True)).to_be_enabled()
        assert not errors, errors
        print(f"PASS failures/retry/volume {layout} {width}", flush=True)
    except Exception:
        page.screenshot(path=str(OUTPUT / "failure.png"))
        (OUTPUT / "failure.txt").write_text(page.locator("body").inner_text() + "\n" + json.dumps(requests))
        raise
    finally:
        context.close()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    try:
        for layout in ["classic", "editorial"]:
            for width in [320, 1280]:
                run(browser, layout, width)
    finally:
        browser.close()
