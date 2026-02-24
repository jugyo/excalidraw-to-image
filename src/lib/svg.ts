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

type FillPatternCatalog = {
  defs: string;
  ids: Map<string, string>;
};

function patternKey(element: NormalizedElement): string {
  return `${element.fillStyle}|${element.backgroundColor}|${element.strokeColor}`;
}

function createFillPatternCatalog(elements: NormalizedElement[]): FillPatternCatalog {
  const ids = new Map<string, string>();
  const defs: string[] = [];

  for (const element of elements) {
    const hasFill = element.backgroundColor && element.backgroundColor !== "transparent";
    if (!hasFill || element.fillStyle === "solid") {
      continue;
    }
    const key = patternKey(element);
    if (ids.has(key)) {
      continue;
    }

    const id = `fill-pattern-${ids.size + 1}`;
    ids.set(key, id);
    const hatch = escapeXml(element.backgroundColor || element.strokeColor);

    if (element.fillStyle === "hachure") {
      defs.push(
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="12" height="12">
  <path d="M-3,3 L3,-3 M0,12 L12,0 M9,15 L15,9" stroke="${hatch}" stroke-width="1.1" fill="none" />
</pattern>`,
      );
      continue;
    }

    defs.push(
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="12" height="12">
  <path d="M-3,3 L3,-3 M0,12 L12,0 M9,15 L15,9" stroke="${hatch}" stroke-width="1.1" fill="none" />
  <path d="M-3,9 L3,15 M0,0 L12,12 M9,-3 L15,3" stroke="${hatch}" stroke-width="1.1" fill="none" />
</pattern>`,
    );
  }

  return {
    defs: defs.join("\n"),
    ids,
  };
}

function strokeStyleAttrs(element: NormalizedElement, scale: number): string {
  if (element.strokeStyle === "dashed") {
    const unit = Math.max(1, element.strokeWidth * scale);
    return `stroke-dasharray="${unit * 8} ${unit * 6}"`;
  }
  if (element.strokeStyle === "dotted") {
    const unit = Math.max(1, element.strokeWidth * scale);
    return `stroke-dasharray="${unit} ${unit * 2.5}" stroke-linecap="round"`;
  }
  return "";
}

function resolveFill(
  element: NormalizedElement,
  patternIds: Map<string, string>,
): string {
  if (!element.backgroundColor || element.backgroundColor === "transparent") {
    return "none";
  }
  if (element.fillStyle === "solid") {
    return element.backgroundColor;
  }

  const patternId = patternIds.get(patternKey(element));
  if (!patternId) {
    return element.backgroundColor;
  }
  return `url(#${patternId})`;
}

function makeStyleAttrs(
  element: NormalizedElement,
  scale: number,
  patternIds: Map<string, string>,
  isText = false,
): string {
  const strokeWidth = Math.max(0, element.strokeWidth) * scale;
  const opacity = normalizeOpacity(element.opacity);

  if (isText) {
    return `fill="${escapeXml(element.strokeColor)}" opacity="${opacity}"`;
  }

  const fill = resolveFill(element, patternIds);
  const strokeStyle = strokeStyleAttrs(element, scale);

  const attrs = [
    `stroke="${escapeXml(element.strokeColor)}"`,
    `fill="${escapeXml(fill)}"`,
    `stroke-width="${strokeWidth}"`,
    `opacity="${opacity}"`,
  ];
  if (strokeStyle) {
    attrs.push(strokeStyle);
  }
  return attrs.join(" ");
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

function roundedPolygonPath(points: Point[], radius: number): string {
  if (points.length < 3 || radius <= 0) {
    return "";
  }

  const safeRadius = Math.max(0, radius);
  const n = points.length;
  const segments: Array<{ entry: Point; corner: Point; exit: Point }> = [];

  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const v1x = prev[0] - curr[0];
    const v1y = prev[1] - curr[1];
    const v2x = next[0] - curr[0];
    const v2y = next[1] - curr[1];
    const len1 = Math.hypot(v1x, v1y) || 1;
    const len2 = Math.hypot(v2x, v2y) || 1;
    const localRadius = Math.min(safeRadius, len1 * 0.45, len2 * 0.45);

    const entry: Point = [
      curr[0] + (v1x / len1) * localRadius,
      curr[1] + (v1y / len1) * localRadius,
    ];
    const exit: Point = [
      curr[0] + (v2x / len2) * localRadius,
      curr[1] + (v2y / len2) * localRadius,
    ];
    segments.push({ entry, corner: curr, exit });
  }

  const first = segments[0];
  let d = `M ${first.exit[0]} ${first.exit[1]}`;
  for (let i = 1; i <= n; i += 1) {
    const segment = segments[i % n];
    d += ` L ${segment.entry[0]} ${segment.entry[1]}`;
    d += ` Q ${segment.corner[0]} ${segment.corner[1]} ${segment.exit[0]} ${segment.exit[1]}`;
  }
  d += " Z";
  return d;
}

function renderRectangle(
  element: NormalizedElement,
  transform: CoordinateTransform,
  patternIds: Map<string, string>,
): string {
  const rawX = Math.min(element.x, element.x + element.width);
  const rawY = Math.min(element.y, element.y + element.height);
  const rawWidth = Math.abs(element.width);
  const rawHeight = Math.abs(element.height);
  const x = transform.x(rawX);
  const y = transform.y(rawY);
  const width = transform.len(rawWidth);
  const height = transform.len(rawHeight);
  const attrs = makeStyleAttrs(element, transform.len(1), patternIds);
  const rotate = getRotationTransform(element, transform);
  const radius = Math.max(0, element.roundness) * transform.len(1);
  const rounded = radius > 0 ? ` rx="${radius}" ry="${radius}"` : "";
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}"${rounded} ${attrs}${rotate} />`;
}

function renderEllipse(
  element: NormalizedElement,
  transform: CoordinateTransform,
  patternIds: Map<string, string>,
): string {
  const cx = transform.x(element.x + element.width / 2);
  const cy = transform.y(element.y + element.height / 2);
  const rx = Math.abs(transform.len(element.width / 2));
  const ry = Math.abs(transform.len(element.height / 2));
  const attrs = makeStyleAttrs(element, transform.len(1), patternIds);
  const rotate = getRotationTransform(element, transform);
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${attrs}${rotate} />`;
}

function renderDiamond(
  element: NormalizedElement,
  transform: CoordinateTransform,
  patternIds: Map<string, string>,
): string {
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
  const attrs = makeStyleAttrs(element, transform.len(1), patternIds);
  const rotate = getRotationTransform(element, transform);
  if (element.roundness > 0) {
    const path = roundedPolygonPath(points, element.roundness * transform.len(1));
    if (path) {
      return `<path d="${path}" ${attrs}${rotate} />`;
    }
  }
  return `<polygon points="${pointsToSvg(points)}" ${attrs}${rotate} />`;
}

function renderLineLike(
  element: NormalizedElement,
  transform: CoordinateTransform,
  patternIds: Map<string, string>,
  withArrowHead: boolean,
): string {
  const absolutePoints = element.points.map((p) => pointToAbs(element, p));
  if (!absolutePoints.length) {
    absolutePoints.push([element.x, element.y]);
  }

  const points = absolutePoints.map(([x, y]) => [transform.x(x), transform.y(y)] as Point);
  const strokeStyle = strokeStyleAttrs(element, transform.len(1));
  const rounded = element.roundness > 0 ? ' stroke-linejoin="round" stroke-linecap="round"' : "";
  const attrs = [
    `stroke="${escapeXml(element.strokeColor)}"`,
    'fill="none"',
    `stroke-width="${Math.max(0, element.strokeWidth) * transform.len(1)}"`,
    `opacity="${normalizeOpacity(element.opacity)}"`,
    strokeStyle,
  ].join(" ");

  const shaftPoints = points.slice();
  let result = "";
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
    const dx = tip[0] - prev[0];
    const dy = tip[1] - prev[1];
    const norm = Math.hypot(dx, dy) || 1;
    const ux = dx / norm;
    const uy = dy / norm;
    const shaftEnd: Point = [tip[0] - ux * headSize * 0.9, tip[1] - uy * headSize * 0.9];
    shaftPoints[shaftPoints.length - 1] = shaftEnd;
    result = `<polyline points="${pointsToSvg(shaftPoints)}" ${attrs}${rounded} />`;

    const headPoints = arrowHead(tip, prev, headSize);
    result += `\n<polygon points="${pointsToSvg(headPoints)}" fill="${escapeXml(
      element.strokeColor,
    )}" opacity="${normalizeOpacity(element.opacity)}" />`;
    return result;
  }

  result = `<polyline points="${pointsToSvg(points)}" ${attrs}${rounded} />`;
  return result;
}

function renderText(element: NormalizedElement, transform: CoordinateTransform): string {
  const fontFamily = FONT_FAMILY_MAP[element.fontFamily] ?? FONT_FAMILY_MAP[1];
  const fontSize = element.fontSize * transform.len(1);
  const lineHeight = element.lineHeight * fontSize;
  const lines = String(element.text).split(/\r?\n/);
  const x = transform.x(element.x);
  const y = transform.y(element.y);
  const attrs = makeStyleAttrs(element, transform.len(1), new Map<string, string>(), true);
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

export function buildSvg(scene: RawExcalidrawScene, options: CliOptions): string {
  const elements = normalizeElements(scene.elements ?? []);
  const fillPatterns = createFillPatternCatalog(elements);
  const bounds = computeSceneBounds(elements);
  const transform = createTransform(bounds, options.padding, options.scale);
  const width = Math.max(1, (bounds.maxX - bounds.minX + options.padding * 2) * options.scale);
  const height = Math.max(1, (bounds.maxY - bounds.minY + options.padding * 2) * options.scale);
  const background = scene.appState?.viewBackgroundColor || "transparent";

  const nodes = elements
    .map((element) => {
      switch (element.type) {
        case "rectangle":
          return renderRectangle(element, transform, fillPatterns.ids);
        case "ellipse":
          return renderEllipse(element, transform, fillPatterns.ids);
        case "diamond":
          return renderDiamond(element, transform, fillPatterns.ids);
        case "line":
          return renderLineLike(element, transform, fillPatterns.ids, false);
        case "arrow":
          return renderLineLike(element, transform, fillPatterns.ids, true);
        case "text":
          return renderText(element, transform);
      }
    })
    .filter(Boolean)
    .join("\n");

  const defs = fillPatterns.defs ? `<defs>\n${fillPatterns.defs}\n</defs>\n` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(background)}" />
${defs}
${nodes}
</svg>
`;
}
