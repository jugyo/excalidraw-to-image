import { FONT_FAMILY_MAP } from "./constants";
import type {
  Bounds,
  CliOptions,
  CoordinateTransform,
  NormalizedElement,
  Point,
  RawExcalidrawScene,
} from "./types";
import { computeSceneBounds } from "./bounds";
import { normalizeElements } from "./normalize";
import { escapeXml, normalizeOpacity, pointToAbs, pointsToSvg } from "./utils";

function createTransform(bounds: Bounds, padding: number, scale: number): CoordinateTransform {
  return {
    x: (rawX) => (rawX - bounds.minX + padding) * scale,
    y: (rawY) => (rawY - bounds.minY + padding) * scale,
    len: (rawLen) => rawLen * scale,
  };
}

function makeStyleAttrs(element: NormalizedElement, scale: number, isText = false): string {
  const strokeWidth = Math.max(0, element.strokeWidth) * scale;
  const opacity = normalizeOpacity(element.opacity);
  const fill =
    !element.backgroundColor || element.backgroundColor === "transparent"
      ? "none"
      : element.backgroundColor;

  if (isText) {
    return `fill="${escapeXml(element.strokeColor)}" opacity="${opacity}"`;
  }

  return [
    `stroke="${escapeXml(element.strokeColor)}"`,
    `fill="${escapeXml(fill)}"`,
    `stroke-width="${strokeWidth}"`,
    `opacity="${opacity}"`,
  ].join(" ");
}

function getRotationTransform(
  element: NormalizedElement,
  transform: CoordinateTransform,
): string {
  if (!element.angle) {
    return "";
  }

  const centerX = transform.x(element.x + element.width / 2);
  const centerY = transform.y(element.y + element.height / 2);
  const deg = (element.angle * 180) / Math.PI;
  return ` transform="rotate(${deg} ${centerX} ${centerY})"`;
}

function arrowHead(last: Point, prev: Point, headSize: number): [Point, Point, Point] {
  const dx = last[0] - prev[0];
  const dy = last[1] - prev[1];
  const norm = Math.hypot(dx, dy) || 1;
  const ux = dx / norm;
  const uy = dy / norm;
  const px = -uy;
  const py = ux;

  const tip: Point = last;
  const baseX = last[0] - ux * headSize;
  const baseY = last[1] - uy * headSize;
  const left: Point = [baseX + px * (headSize * 0.55), baseY + py * (headSize * 0.55)];
  const right: Point = [baseX - px * (headSize * 0.55), baseY - py * (headSize * 0.55)];

  return [tip, left, right];
}

function renderRectangle(element: NormalizedElement, transform: CoordinateTransform): string {
  const x = transform.x(element.x);
  const y = transform.y(element.y);
  const width = transform.len(element.width);
  const height = transform.len(element.height);
  const attrs = makeStyleAttrs(element, transform.len(1));
  const rotate = getRotationTransform(element, transform);
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" ${attrs}${rotate} />`;
}

function renderEllipse(element: NormalizedElement, transform: CoordinateTransform): string {
  const cx = transform.x(element.x + element.width / 2);
  const cy = transform.y(element.y + element.height / 2);
  const rx = Math.abs(transform.len(element.width / 2));
  const ry = Math.abs(transform.len(element.height / 2));
  const attrs = makeStyleAttrs(element, transform.len(1));
  const rotate = getRotationTransform(element, transform);
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${attrs}${rotate} />`;
}

function renderDiamond(element: NormalizedElement, transform: CoordinateTransform): string {
  const x = element.x;
  const y = element.y;
  const w = element.width;
  const h = element.height;
  const points: Point[] = [
    [transform.x(x + w / 2), transform.y(y)],
    [transform.x(x + w), transform.y(y + h / 2)],
    [transform.x(x + w / 2), transform.y(y + h)],
    [transform.x(x), transform.y(y + h / 2)],
  ];
  const attrs = makeStyleAttrs(element, transform.len(1));
  const rotate = getRotationTransform(element, transform);
  return `<polygon points="${pointsToSvg(points)}" ${attrs}${rotate} />`;
}

function renderLineLike(
  element: NormalizedElement,
  transform: CoordinateTransform,
  withArrowHead: boolean,
): string {
  const absolutePoints = element.points.map((p) => pointToAbs(element, p));
  if (!absolutePoints.length) {
    absolutePoints.push([element.x, element.y]);
  }

  const points = absolutePoints.map(([x, y]) => [transform.x(x), transform.y(y)] as Point);
  const attrs = [
    `stroke="${escapeXml(element.strokeColor)}"`,
    'fill="none"',
    `stroke-width="${Math.max(0, element.strokeWidth) * transform.len(1)}"`,
    `opacity="${normalizeOpacity(element.opacity)}"`,
  ].join(" ");

  let result = `<polyline points="${pointsToSvg(points)}" ${attrs} />`;
  if (withArrowHead && points.length >= 2) {
    const tip = points[points.length - 1];
    let prev = points[points.length - 2];
    for (let i = points.length - 2; i >= 0; i -= 1) {
      if (points[i][0] !== tip[0] || points[i][1] !== tip[1]) {
        prev = points[i];
        break;
      }
    }

    const headSize = Math.max(8, element.strokeWidth * 4) * transform.len(1);
    const headPoints = arrowHead(tip, prev, headSize);
    result += `\n<polygon points="${pointsToSvg(headPoints)}" fill="${escapeXml(
      element.strokeColor,
    )}" opacity="${normalizeOpacity(element.opacity)}" />`;
  }

  return result;
}

function renderText(element: NormalizedElement, transform: CoordinateTransform): string {
  const fontFamily = FONT_FAMILY_MAP[element.fontFamily] ?? FONT_FAMILY_MAP[1];
  const fontSize = element.fontSize * transform.len(1);
  const lineHeight = element.lineHeight * fontSize;
  const lines = String(element.text).split(/\r?\n/);
  const x = transform.x(element.x);
  const y = transform.y(element.y);
  const attrs = makeStyleAttrs(element, transform.len(1), true);
  const rotate = getRotationTransform(element, transform);
  const tspans = lines
    .map((line, idx) => {
      const dy = idx === 0 ? 0 : lineHeight;
      return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  return `<text x="${x}" y="${y}" font-family="${escapeXml(
    fontFamily,
  )}" font-size="${fontSize}" dominant-baseline="hanging" ${attrs}${rotate}>${tspans}</text>`;
}

function renderElement(element: NormalizedElement, transform: CoordinateTransform): string {
  switch (element.type) {
    case "rectangle":
      return renderRectangle(element, transform);
    case "ellipse":
      return renderEllipse(element, transform);
    case "diamond":
      return renderDiamond(element, transform);
    case "line":
      return renderLineLike(element, transform, false);
    case "arrow":
      return renderLineLike(element, transform, true);
    case "text":
      return renderText(element, transform);
  }
}

export function buildSvg(scene: RawExcalidrawScene, options: CliOptions): string {
  const elements = normalizeElements(scene.elements ?? []);
  const bounds = computeSceneBounds(elements);
  const transform = createTransform(bounds, options.padding, options.scale);
  const width = Math.max(1, (bounds.maxX - bounds.minX + options.padding * 2) * options.scale);
  const height = Math.max(1, (bounds.maxY - bounds.minY + options.padding * 2) * options.scale);
  const background = scene.appState?.viewBackgroundColor || "transparent";

  const nodes = elements
    .map((element) => renderElement(element, transform))
    .filter(Boolean)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(background)}" />
${nodes}
</svg>
`;
}
