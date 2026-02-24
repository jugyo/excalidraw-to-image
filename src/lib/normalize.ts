import { SUPPORTED_TYPES } from "./constants";
import type { NormalizedElement, Point, RawExcalidrawElement } from "./types";
import { ensureNumber } from "./utils";

function normalizePoints(points: unknown): Point[] {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.map((point): Point => {
    if (!Array.isArray(point)) {
      return [0, 0];
    }
    return [ensureNumber(point[0], 0), ensureNumber(point[1], 0)];
  });
}

function toNormalizedElement(element: RawExcalidrawElement): NormalizedElement {
  return {
    type: element.type as NormalizedElement["type"],
    x: ensureNumber(element.x, 0),
    y: ensureNumber(element.y, 0),
    width: ensureNumber(element.width, 0),
    height: ensureNumber(element.height, 0),
    angle: ensureNumber(element.angle, 0),
    strokeColor: element.strokeColor || "#000000",
    backgroundColor: element.backgroundColor || "transparent",
    strokeWidth: ensureNumber(element.strokeWidth, 1),
    opacity: ensureNumber(element.opacity, 100),
    points: normalizePoints(element.points),
    text: element.text ?? "",
    fontSize: ensureNumber(element.fontSize, 20),
    fontFamily: ensureNumber(element.fontFamily, 1),
    lineHeight: ensureNumber(element.lineHeight, 1.2),
  };
}

export function normalizeElements(elements: RawExcalidrawElement[]): NormalizedElement[] {
  return elements
    .filter((element): element is RawExcalidrawElement => {
      if (!element || element.isDeleted) {
        return false;
      }
      return SUPPORTED_TYPES.has(element.type as NormalizedElement["type"]);
    })
    .map(toNormalizedElement);
}
