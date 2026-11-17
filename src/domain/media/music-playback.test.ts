import { afterEach, describe, expect, it, vi } from "vitest";
import { diagnoseMusicStream, readMusicDetail } from "./media-client";

afterEach(() => vi.unstubAllGlobals());
describe("music metadata and one-shot failure diagnosis", () => {
  it("opts out of the redundant detail URL lookup and keeps song data", async () => {
    const fetch=vi.fn(async()=>new Response(JSON.stringify({id:42,album:"Album",audio_url:"https://ignored.invalid/expired"}),{headers:{"content-type":"application/json"}}));
    vi.stubGlobal("fetch",fetch);
    expect(await readMusicDetail(42,new AbortController().signal)).toEqual({album:"Album",cover:undefined});
    expect(String((fetch.mock.calls as unknown as [string,RequestInit][])[0][0])).toContain("/api/music/detail/42?include_audio_url=false");
  });
  it.each([
    ["music_url_unavailable","播放链接获取失败"], ["music_url_request_failed","音乐服务请求未能完成"],
    ["music_resource_forbidden","音频资源拒绝访问"], ["music_resource_unavailable","已获取链接"],
    ["music_resource_invalid","未返回有效音频"], ["music_resource_connection_failed","音频连接失败"],
  ])("maps %s independently from login status and does not retry",async(code,expected)=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify({code,error:"private provider body"}),{status:502,headers:{"content-type":"application/json"}}));
    vi.stubGlobal("fetch",fetch);
    const message=await diagnoseMusicStream(42,new AbortController().signal);
    expect(message).toContain(expected);expect(message).not.toMatch(/未登录|private/);expect(fetch).toHaveBeenCalledOnce();
    const options=(fetch.mock.calls as unknown as [string,RequestInit][])[0][1];
    expect(new Headers(options.headers).get("Range")).toBe("bytes=0-0");expect(options.credentials).toBe("include");
  });
  it("cancels successful bodies without downloading the entire song or replaying",async()=>{
    const cancel=vi.fn(); vi.stubGlobal("fetch",vi.fn(async()=>new Response(new ReadableStream({cancel}),{headers:{"content-type":"audio/mpeg"}})));
    expect(await diagnoseMusicStream(42,new AbortController().signal)).toContain("当前链接检查可用");expect(cancel).toHaveBeenCalledOnce();
  });
  it("treats unknown/legacy failures as unconfirmed rather than requiring Netease login",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({error:"old response"}),{status:404,headers:{"content-type":"application/json"}})));
    expect(await diagnoseMusicStream(42,new AbortController().signal)).toContain("无法确认链接状态");
  });
});
