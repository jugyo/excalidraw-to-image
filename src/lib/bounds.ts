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

  const x2 = element.x + element.width;
  const y2 = element.y + element.height;
  return {
    minX: Math.min(element.x, x2),
    minY: Math.min(element.y, y2),
    maxX: Math.max(element.x, x2),
    maxY: Math.max(element.y, y2),
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
