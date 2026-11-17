import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioController } from "./audio-controller";
import { createMusicVolumePreference } from "./music-volume";

afterEach(() => vi.unstubAllGlobals());
function storage(saved: string | null = null) {
  let value = saved;
  const storage = { getItem: vi.fn(() => value), setItem: vi.fn((_key: string, next: string) => { value = next; }) };
  vi.stubGlobal("localStorage", storage); return storage;
}
describe("device music volume", () => {
  it.each([[null,100],["",100],["broken",100],["-2",0],["150",100],["25.5",25.5]])("reads existing Web preference %j without changing defaults/range", (saved, expected) => {
    storage(saved); expect(createMusicVolumePreference().read()).toBe(expected);
  });
  it("writes integer percentages and restores in a fresh scope", () => {
    const s = storage("20"); const p = createMusicVolumePreference(); expect(p.write(36.7)).toEqual({ volume:37,volumeError:null });
    expect(s.setItem).toHaveBeenCalledWith("aion_music_volume","37"); expect(createMusicVolumePreference().read()).toBe(37);
  });
  it("prefers Native and mirrors writes to Web without changing the system volume", () => {
    const s = storage("20"); let native = 62; const setMusicVolume = vi.fn(value => { native = value; });
    vi.stubGlobal("window", { AionMusic: { getMusicVolume: () => native, setMusicVolume } });
    const p = createMusicVolumePreference(); expect(p.read()).toBe(62); p.write(0);
    expect(setMusicVolume).toHaveBeenCalledWith(0); expect(s.setItem).toHaveBeenCalledWith("aion_music_volume","0"); expect(createMusicVolumePreference().read()).toBe(0);
  });
  it.each([{}, {getMusicVolume:()=>{throw Error("unavailable");}, setMusicVolume:()=>{throw Error("unavailable");}}, {getMusicVolume:()=>80}])("uses Web when bridge is partial or throws", native => {
    storage("28"); vi.stubGlobal("window", { AionMusic: native }); const p = createMusicVolumePreference();
    p.write(42); expect(p.read()).toBe(42); expect(createMusicVolumePreference().write(42).volumeError).toBeNull();
  });
  it("falls back to Web on native read failure", () => {
    storage("28"); vi.stubGlobal("window", { AionMusic:{ getMusicVolume:()=>{throw Error("unavailable");} } });
    expect(createMusicVolumePreference().read()).toBe(28);
  });
  it("keeps Native persistence if localStorage is unavailable, and reports when both fail", () => {
    vi.stubGlobal("localStorage", { getItem:()=>{throw Error();}, setItem:()=>{throw Error();} });
    vi.stubGlobal("window", { AionMusic: { getMusicVolume:()=>55,setMusicVolume:vi.fn() } });
    expect(createMusicVolumePreference().write(20).volumeError).toBeNull();
    vi.stubGlobal("window", {}); const p=createMusicVolumePreference(); expect(p.read()).toBe(100);
    expect(p.write(30).volumeError).toBeTruthy(); expect(p.read()).toBe(30);
  });
  it("updates playing audio immediately without restarting it and restores after replay", () => {
    storage("25"); const audio = Object.assign(new EventTarget(), {volume:1,paused:true,ended:false,currentTime:0,duration:NaN,seekable:{length:0},preload:"",src:"",play:vi.fn(async()=>{}),pause:vi.fn(),load:vi.fn(),removeAttribute:vi.fn()});
    const controller = createAudioController(()=>audio as unknown as HTMLAudioElement);
    expect(controller.getState().volume).toBe(25); controller.play("one",42); expect(audio.volume).toBe(.25);
    audio.paused=false; audio.dispatchEvent(new Event("playing")); controller.setVolume(38);
    expect(audio.volume).toBe(.38); expect(controller.getState().status).toBe("playing"); expect(audio.play).toHaveBeenCalledTimes(1);
    controller.stop(); controller.play("two",44); expect(audio.volume).toBe(.38);
    controller.dispose(); expect(createAudioController().getState().volume).toBe(38);
  });
});
