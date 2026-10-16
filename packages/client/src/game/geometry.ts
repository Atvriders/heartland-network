/** Map view projection: world km <-> screen px. */

export interface ViewTransform {
  cx: number;
  cy: number;
  scale: number;
  width: number;
  height: number;
}

export function worldToScreen(t: ViewTransform, x: number, y: number): { x: number; y: number } {
  return {
    x: (x - t.cx) * t.scale + t.width / 2,
    y: (y - t.cy) * t.scale + t.height / 2,
  };
}

export function screenToWorld(t: ViewTransform, x: number, y: number): { x: number; y: number } {
  return {
    x: (x - t.width / 2) / t.scale + t.cx,
    y: (y - t.height / 2) / t.scale + t.cy,
  };
}

export function fitView(
  mapWidthKm: number,
  mapHeightKm: number,
  width: number,
  height: number,
): { cx: number; cy: number; scale: number } {
  const scale = Math.min(width / mapWidthKm, height / mapHeightKm) * 0.96;
  return { cx: mapWidthKm / 2, cy: mapHeightKm / 2, scale };
}

export function clampScale(s: number): number {
  return Math.min(26, Math.max(0.35, s));
}

/** Distance between two screen points. */
export function screenDist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
