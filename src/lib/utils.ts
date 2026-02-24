import type { NormalizedElement, Point } from "./types";

export function ensureNumber(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

export function normalizeOpacity(value: number): number {
  const pct = ensureNumber(value, 100);
  return Math.max(0, Math.min(100, pct)) / 100;
}

export function escapeXml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function pointToAbs(element: NormalizedElement, point: Point): Point {
  const px = ensureNumber(point?.[0], 0);
  const py = ensureNumber(point?.[1], 0);
  return [ensureNumber(element.x, 0) + px, ensureNumber(element.y, 0) + py];
}

export function pointsToSvg(points: Point[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}
