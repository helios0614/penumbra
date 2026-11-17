import { describe, expect, it, vi } from "vitest";
import { createAudioController } from "./audio-controller";

class FakeAudio extends EventTarget {
  src = ""; preload = ""; volume = 1; currentTime = 0; duration = NaN; paused = true; ended = false;
  ranges: [number, number][] = [];
  seekable = { get length() { return owner.ranges.length; }, start: (i: number) => this.ranges[i][0], end: (i: number) => this.ranges[i][1] };
  reject: ((e: Error) => void) | null = null;
  play = vi.fn(() => { this.paused = false; return new Promise<void>((_, reject) => { this.reject = reject; }); });
  pause = vi.fn(() => { this.paused = true; this.dispatchEvent(new Event("pause")); });
  load = vi.fn();
  removeAttribute() { this.src = ""; }
  constructor() { super(); const self = this; this.seekable = { get length() { return self.ranges.length; }, start: i => self.ranges[i][0], end: i => self.ranges[i][1] }; }
  event(name: string) { this.dispatchEvent(new Event(name)); }
}
// Placeholder is never read; each FakeAudio installs its own seekable object.
const owner = { ranges: [] as [number, number][] };
function setup(diagnose = vi.fn(async()=>"音频播放失败；当前链接检查可用，请点击重试。")) { const audio = new FakeAudio(); const factory = vi.fn(() => audio as unknown as HTMLAudioElement); const controller = createAudioController(factory,undefined,diagnose); return { audio, factory, controller, diagnose }; }
describe("browser music resource lifecycle", () => {
  it("uses the actual 20-second preview duration and treats its end as normal", () => {
    const s=setup();s.controller.play("preview",36390008);
    s.audio.duration=20;s.audio.event("loadedmetadata");s.audio.event("playing");
    expect(s.controller.getState()).toMatchObject({status:"playing",duration:20,error:null});
    s.controller.setVolume(45);s.audio.currentTime=20;s.audio.ended=true;s.audio.event("ended");
    expect(s.controller.getState()).toMatchObject({status:"ended",duration:20,position:20,volume:45,error:null});
    expect(s.diagnose).not.toHaveBeenCalled();expect(s.audio.play).toHaveBeenCalledOnce();
  });
  it("checks a media error once, preserves identity and waits for a manual retry", async()=>{
    const s=setup(); s.controller.play("song",42); s.audio.event("error"); s.audio.reject!(new Error("network"));
    await Promise.resolve(); await Promise.resolve();
    expect(s.diagnose).toHaveBeenCalledOnce(); expect(s.controller.getState()).toMatchObject({identity:"song",status:"error",error:expect.stringContaining("当前链接检查可用")});
    expect(s.audio.play).toHaveBeenCalledTimes(1); s.controller.play("song",42); expect(s.audio.play).toHaveBeenCalledTimes(2);
  });
  it("aborts diagnostics on song change and ignores its late result",async()=>{
    let resolve!:(message:string)=>void;
    const diagnose=vi.fn(()=>new Promise<string>(done=>{resolve=done;}));const s=setup(diagnose);
    s.controller.play("one",42);s.audio.event("error");const signal=(diagnose.mock.calls as unknown as [number,AbortSignal][])[0][1];
    s.controller.play("two",44);expect(signal.aborted).toBe(true);resolve("old failure");await Promise.resolve();
    expect(s.controller.getState()).toMatchObject({identity:"two",status:"loading",error:null});
  });
  it("does not create/preload audio before a click and never optimistically claims playback", () => {
    const s = setup(); expect(s.factory).not.toHaveBeenCalled(); s.controller.play("A:1", 42);
    expect(s.audio.src).toContain("/api/music/stream/42"); expect(s.controller.getState().status).toBe("loading");
    s.audio.event("playing"); expect(s.controller.getState().status).toBe("playing"); s.audio.event("waiting"); expect(s.controller.getState().status).toBe("buffering");
  });
  it("uses actual time/duration and only seeks within actual seekable ranges", () => {
    const s = setup(); s.controller.play("A:1", 42); s.audio.duration = 100; s.audio.currentTime = 25; s.audio.event("timeupdate");
    expect(s.controller.getState()).toMatchObject({ duration: 100, position: 25, seekable: false }); s.controller.seek(.5); expect(s.audio.currentTime).toBe(25);
    s.audio.ranges = [[0, 60]]; s.audio.event("progress"); s.controller.seek(.5); expect(s.audio.currentTime).toBe(50); s.controller.seek(.9); expect(s.audio.currentTime).toBe(50);
  });
  it("old play rejection cannot fail a newly selected song", async () => {
    const s = setup(); s.controller.play("A:1", 42); const reject = s.audio.reject!; s.controller.play("A:2", 43); reject(new Error("old")); await Promise.resolve();
    expect(s.factory).toHaveBeenCalledOnce(); expect(s.controller.getState()).toMatchObject({ identity: "A:2", status: "loading" });
  });
  it("pause during load does not become an error; actual failure offers explicit retry", async () => {
    const s = setup(); s.controller.play("A:1", 42); const reject = s.audio.reject!; s.controller.play("A:1", 42); reject(new Error("aborted")); await Promise.resolve();
    expect(s.controller.getState().status).toBe("paused"); s.controller.play("A:1", 42); s.audio.reject!(new Error("NotAllowed")); await Promise.resolve();
    expect(s.controller.getState().status).toBe("error"); s.controller.play("A:1", 42); expect(s.controller.getState().status).toBe("loading");
  });
  it("ending, switching scope and unmount release the source and ignore late events", () => {
    const s = setup(); s.controller.play("A:1", 42); s.audio.ended = true; s.audio.event("ended"); expect(s.controller.getState().status).toBe("ended");
    s.controller.stop(); expect(s.audio.src).toBe(""); expect(s.controller.getState().identity).toBeNull();
    s.controller.dispose(); s.audio.event("playing"); expect(s.controller.getState().status).toBe("idle");
  });
});
