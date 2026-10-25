export type Point = { x: number; y: number };
export function clampZoom(value: number) { return Math.max(1, Math.min(8, value)); }
export function clampPan(point: Point, scale: number, stage: { width: number; height: number }, image: { width: number; height: number }): Point {
  if (!stage.width || !stage.height || !image.width || !image.height || scale <= 1) return { x: 0, y: 0 };
  const fit = Math.min(stage.width / image.width, stage.height / image.height, 1);
  const x = Math.max(0, (image.width * fit * scale - stage.width) / 2);
  const y = Math.max(0, (image.height * fit * scale - stage.height) / 2);
  return { x: Math.max(-x, Math.min(x, point.x)), y: Math.max(-y, Math.min(y, point.y)) };
}
export function swipeDirection(dx: number, dy: number) { return Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx < 0 ? 1 : -1) : 0; }
