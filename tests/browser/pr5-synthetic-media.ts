export const pictures = ["wide.svg", "portrait.svg", "long.svg"].map(name => new URL(`./media-fixtures/${name}`, import.meta.url).href);
export function localTone() {
  const rate = 16000, count = rate * 12, bytes = new ArrayBuffer(44 + count * 2), view = new DataView(bytes);
  const text = (offset: number, value: string) => [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + count * 2, true); text(8, "WAVEfmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) view.setInt16(44 + i * 2, Math.sin(i / rate * Math.PI * 440) * 1100 * Math.min(1, i / 800, (count - i) / 800), true);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}
export async function samplePicture() {
  const image = new Image(); image.src = pictures[0]; await image.decode();
  const canvas = document.createElement("canvas"); canvas.width = 960; canvas.height = 540; canvas.getContext("2d")!.drawImage(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("PNG creation failed")), "image/png"));
  return new File([blob], "合成横图.png", { type: "image/png" });
}
export async function sampleVideo() {
  if (typeof MediaRecorder === "undefined") throw new Error("此浏览器无法生成合成视频，可选择本地测试视频。");
  const mime = ["video/webm", "video/mp4"].find(value => MediaRecorder.isTypeSupported(value));
  if (!mime) throw new Error("此浏览器无法生成合成视频，可选择本地测试视频。");
  const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
  const stream = canvas.captureStream(12), recorder = new MediaRecorder(stream, { mimeType: mime }), chunks: BlobPart[] = [];
  const draw = setInterval(() => { const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#dce4e4"; ctx.fillRect(0, 0, 320, 180); ctx.fillStyle = "#536d79"; ctx.font = "20px sans-serif"; ctx.fillText("Synthetic video", 40, 80); ctx.fillRect(30 + (Date.now() / 20 % 220), 110, 30, 20); }, 70);
  try {
    return await new Promise<File>((resolve, reject) => {
      recorder.ondataavailable = event => chunks.push(event.data); recorder.onerror = () => reject(new Error("合成视频生成失败"));
      recorder.onstop = () => resolve(new File(chunks, `合成视频.${mime.endsWith("mp4") ? "mp4" : "webm"}`, { type: mime }));
      recorder.start(); setTimeout(() => recorder.stop(), 1000);
    });
  } finally { clearInterval(draw); stream.getTracks().forEach(track => track.stop()); }
}
