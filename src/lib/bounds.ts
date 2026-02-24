import type { Bounds, NormalizedElement } from "./types";
import { pointToAbs } from "./utils";

function computeLineBounds(element: NormalizedElement): Bounds {
  const points = element.points;
  if (!points.length) {
    return {
      minX: element.x,
      minY: element.y,
      maxX: element.x,
      maxY: element.y,
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    const [ax, ay] = pointToAbs(element, point);
    minX = Math.min(minX, ax);
    minY = Math.min(minY, ay);
    maxX = Math.max(maxX, ax);
    maxY = Math.max(maxY, ay);
  }

  return { minX, minY, maxX, maxY };
}

function getElementBounds(element: NormalizedElement): Bounds {
  if (element.type === "line" || element.type === "arrow") {
    return computeLineBounds(element);
  }

  const x1 = element.x;
  const y1 = element.y;
  const x2 = element.x + element.width;
  const y2 = element.y + element.height;

  const corners: Array<[number, number]> = [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ];

  if (!element.angle) {
    return {
      minX: Math.min(x1, x2),
      minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2),
      maxY: Math.max(y1, y2),
    };
  }

  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  const cos = Math.cos(element.angle);
  const sin = Math.sin(element.angle);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of corners) {
    const dx = x - cx;
    const dy = y - cy;
    const rx = cx + dx * cos - dy * sin;
    const ry = cy + dx * sin + dy * cos;
    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx);
    maxY = Math.max(maxY, ry);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
  };
}

export function computeSceneBounds(elements: NormalizedElement[]): Bounds {
  if (!elements.length) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const element of elements) {
    const bounds = getElementBounds(element);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  return { minX, minY, maxX, maxY };
}
