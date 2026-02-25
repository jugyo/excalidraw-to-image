import fs from "node:fs";
import path from "node:path";
import { FONT_FAMILY_MAP } from "./constants";
import {
  buildPolygonHatchPath,
  doubleStrokePath,
  ellipseToPolyline,
  jitterPath,
  polygonPath,
  variableWidthStrokeFillPath,
} from "./handdrawn";
import { computeSceneBounds } from "./bounds";
import { normalizeElements } from "./normalize";
import { VIRGIL_TTF_FILE_RELATIVE_PATH } from "./constants";
import type {
  Bounds,
  CliOptions,
  CoordinateTransform,
  NormalizedElement,
  NormalizedImageElement,
  NormalizedLineLikeElement,
  NormalizedShapeElement,
  NormalizedTextElement,
  Point,
  RawExcalidrawScene,
} from "./types";
import { escapeXml, normalizeOpacity, pointToAbs, pointsToSvg } from "./utils";

let embeddedVirgilCssCache: string | null = null;

function getEmbeddedVirgilCss(): string {
  if (embeddedVirgilCssCache !== null) {
    return embeddedVirgilCssCache;
  }

  try {
    const fontPath = path.resolve(import.meta.dir, VIRGIL_TTF_FILE_RELATIVE_PATH);
    const base64 = fs.readFileSync(fontPath).toString("base64");
    embeddedVirgilCssCache =
      `@font-face { font-family: 'Virgil'; src: url('data:font/ttf;base64,${base64}') format('truetype'); font-weight: normal; font-style: normal; }`;
  } catch {
    embeddedVirgilCssCache = "";
  }

  return embeddedVirgilCssCache;
}

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

type ImageClipCatalog = {
  defs: string[];
  nextId: number;
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
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="12" height="12">\n  <path d="M-3,3 L3,-3 M0,12 L12,0 M9,15 L15,9" stroke="${hatch}" stroke-width="1.1" fill="none" />\n</pattern>`,
      );
      continue;
    }

    defs.push(
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="12" height="12">\n  <path d="M-3,3 L3,-3 M0,12 L12,0 M9,15 L15,9" stroke="${hatch}" stroke-width="1.1" fill="none" />\n  <path d="M-3,9 L3,15 M0,0 L12,12 M9,-3 L15,3" stroke="${hatch}" stroke-width="1.1" fill="none" />\n</pattern>`,
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
    return `stroke-dasharray="${unit * 3.2} ${unit * 2.2}"`;
  }
  if (element.strokeStyle === "dotted") {
    const unit = Math.max(1, element.strokeWidth * scale);
    return `stroke-dasharray="0 ${unit * 2.2}"`;
  }
  return "";
}

function resolveFill(element: NormalizedElement, patternIds: Map<string, string>): string {
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
  if (element.strokeStyle === "dotted") {
    attrs.push('stroke-linecap="round"');
  }
  if (strokeStyle) {
    attrs.push(strokeStyle);
  }
  return attrs.join(" ");
}

function getRotationTransform(element: NormalizedElement, transform: CoordinateTransform): string {
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

function roundedPolygonPoints(points: Point[], radius: number, segmentsPerCorner = 4): Point[] {
  if (points.length < 3 || radius <= 0) {
    return points;
  }

  const safeRadius = Math.max(0, radius);
  const n = points.length;
  const out: Point[] = [];

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

    if (out.length === 0) {
      out.push(entry);
    } else {
      out.push(entry);
    }

    for (let s = 1; s <= segmentsPerCorner; s += 1) {
      const t = s / (segmentsPerCorner + 1);
      const omt = 1 - t;
      out.push([
        omt * omt * entry[0] + 2 * omt * t * curr[0] + t * t * exit[0],
        omt * omt * entry[1] + 2 * omt * t * curr[1] + t * t * exit[1],
      ]);
    }

    out.push(exit);
  }

  return out;
}

function renderRectangleClean(
  element: NormalizedShapeElement,
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

function renderEllipseClean(
  element: NormalizedShapeElement,
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

function diamondPoints(element: NormalizedShapeElement, transform: CoordinateTransform): Point[] {
  const x = element.x;
  const y = element.y;
  const w = element.width;
  const h = element.height;
  return [
    [transform.x(x + w / 2), transform.y(y)],
    [transform.x(x + w), transform.y(y + h / 2)],
    [transform.x(x + w / 2), transform.y(y + h)],
    [transform.x(x), transform.y(y + h / 2)],
  ];
}

function renderDiamondClean(
  element: NormalizedShapeElement,
  transform: CoordinateTransform,
  patternIds: Map<string, string>,
): string {
  const points = diamondPoints(element, transform);
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

function renderLineLikeClean(
  element: NormalizedLineLikeElement,
  transform: CoordinateTransform,
  withArrowHead: boolean,
): string {
  const absolutePoints = element.points.map((p) => pointToAbs(element, p));
  if (!absolutePoints.length) {
    absolutePoints.push([element.x, element.y]);
  }

  const points = absolutePoints.map(([x, y]) => [transform.x(x), transform.y(y)] as Point);
  const strokeStyle = strokeStyleAttrs(element, transform.len(1));
  const rounded = ' stroke-linejoin="round" stroke-linecap="round"';
  const attrs = [
    `stroke="${escapeXml(element.strokeColor)}"`,
    'fill="none"',
    `stroke-width="${Math.max(0, element.strokeWidth) * transform.len(1)}"`,
    `opacity="${normalizeOpacity(element.opacity)}"`,
    strokeStyle,
  ].join(" ");

  const shaftPoints = points.slice();
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
    return `<polyline points="${pointsToSvg(shaftPoints)}" ${attrs}${rounded} />\n<polygon points="${pointsToSvg(
      headPoints,
    )}" fill="${escapeXml(element.strokeColor)}" opacity="${normalizeOpacity(element.opacity)}" />`;
  }

  return `<polyline points="${pointsToSvg(points)}" ${attrs}${rounded} />`;
}

function renderText(element: NormalizedTextElement, transform: CoordinateTransform): string {
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
  )}" font-size="${fontSize}" dominant-baseline="text-before-edge" ${attrs}${rotate}>${tspans}</text>`;
}

function buildImageClipPath(
  element: NormalizedImageElement,
  transform: CoordinateTransform,
  clips: ImageClipCatalog,
): string {
  if (!element.crop) {
    return "";
  }

  const clipX = transform.x(element.x + element.crop.x);
  const clipY = transform.y(element.y + element.crop.y);
  const clipWidth = transform.len(element.crop.width);
  const clipHeight = transform.len(element.crop.height);
  if (clipWidth <= 0 || clipHeight <= 0) {
    return "";
  }

  const id = `image-clip-${clips.nextId}`;
  clips.nextId += 1;
  clips.defs.push(
    `<clipPath id="${id}"><rect x="${clipX}" y="${clipY}" width="${clipWidth}" height="${clipHeight}" /></clipPath>`,
  );
  return ` clip-path="url(#${id})"`;
}

function renderImage(element: NormalizedImageElement, transform: CoordinateTransform, clips: ImageClipCatalog): string {
  const rawX = Math.min(element.x, element.x + element.width);
  const rawY = Math.min(element.y, element.y + element.height);
  const rawWidth = Math.abs(element.width);
  const rawHeight = Math.abs(element.height);
  const x = transform.x(rawX);
  const y = transform.y(rawY);
  const width = transform.len(rawWidth);
  const height = transform.len(rawHeight);
  const opacity = normalizeOpacity(element.opacity);
  const rotate = getRotationTransform(element, transform);
  const clipPath = buildImageClipPath(element, transform, clips);
  const href = escapeXml(element.dataURL);

  return `<image x="${x}" y="${y}" width="${width}" height="${height}" opacity="${opacity}" preserveAspectRatio="none" href="${href}" xlink:href="${href}"${clipPath}${rotate} />`;
}

function positionedText(
  element: NormalizedTextElement,
  transform: CoordinateTransform,
  elementsById: Map<string, NormalizedElement>,
): NormalizedTextElement {
  if (!element.containerId) {
    return element;
  }

  const container = elementsById.get(element.containerId);
  if (!container) {
    return element;
  }

  const containerMinX = Math.min(container.x, container.x + container.width);
  const containerMinY = Math.min(container.y, container.y + container.height);
  const containerWidth = Math.abs(container.width);
  const containerHeight = Math.abs(container.height);
  const textWidth = Math.abs(element.width);
  const textHeight = Math.abs(element.height);

  let x = containerMinX;
  if (element.textAlign === "center") {
    x = containerMinX + (containerWidth - textWidth) / 2;
  } else if (element.textAlign === "right") {
    x = containerMinX + (containerWidth - textWidth);
  }

  let y = containerMinY;
  if (element.verticalAlign === "middle") {
    y = containerMinY + (containerHeight - textHeight) / 2;
  } else if (element.verticalAlign === "bottom") {
    y = containerMinY + (containerHeight - textHeight);
  }

  // Preserve the existing global transform assumptions by snapping through transform+inverse offset.
  return {
    ...element,
    x,
    y,
  };
}

function renderHanddrawnStrokes(
  element: NormalizedElement,
  points: Point[],
  seed: string,
  closed: boolean,
  scale: number,
  extraAttrs = "",
  options?: {
    roughness?: number;
    doubleStroke?: boolean;
  },
): string {
  const strokeWidth = Math.max(0.5, element.strokeWidth * scale);
  const opacity = normalizeOpacity(element.opacity);
  const dash = strokeStyleAttrs(element, scale);
  const stroke = escapeXml(element.strokeColor);
  const roughness = options?.roughness ?? 1;
  const enableDoubleStroke = options?.doubleStroke ?? strokeWidth < 3;
  const paths = doubleStrokePath(points, { seed, strokeWidth, closed, amplitudeScale: roughness });

  const hasExplicitLinecap = extraAttrs.includes("stroke-linecap=");
  const dottedCap = element.strokeStyle === "dotted" && !hasExplicitLinecap ? 'stroke-linecap="round"' : "";
  const attrs = [dash, dottedCap, extraAttrs].filter(Boolean).join(" ");
  if (!enableDoubleStroke) {
    const singlePath = jitterPath(points, { seed, strokeWidth, closed, amplitudeScale: roughness });
    const layers: string[] = [
      `<path d="${singlePath}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" ${attrs} />`,
    ];
    if (roughness >= 0.85) {
      const secondaryPath = jitterPath(points, {
        seed: `${seed}:layer2`,
        strokeWidth,
        closed,
        amplitudeScale: roughness * 1.1,
      });
      const secondaryWidth = Math.max(0.4, strokeWidth * (roughness >= 1.4 ? 0.72 : 0.9));
      const secondaryOpacity = opacity * (roughness >= 1.4 ? 0.22 : 0.18);
      layers.push(
        `<path d="${secondaryPath}" fill="none" stroke="${stroke}" stroke-width="${secondaryWidth}" opacity="${secondaryOpacity}" ${attrs} />`,
      );
    }
    if (roughness >= 1.4) {
      const accentWeight = Math.min(0.75, 0.48 + (roughness - 1) * 0.14);
      const accentOpacity = Math.min(0.5, 0.28 + (roughness - 1) * 0.14);
      const accentPath = jitterPath(points, {
        seed: `${seed}:accent`,
        strokeWidth,
        closed,
        amplitudeScale: roughness * 1.05,
      });
      layers.push(
        `<path d="${accentPath}" fill="none" stroke="${stroke}" stroke-width="${Math.max(
          0.4,
          strokeWidth * accentWeight,
        )}" opacity="${opacity * accentOpacity}" ${attrs} />`,
      );
    }
    return layers.join("\n");
  }
  return `<path d="${paths.primaryPath}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" ${attrs} />\n<path d="${paths.secondaryPath}" fill="none" stroke="${stroke}" stroke-width="${Math.max(0.4, strokeWidth * 0.9)}" opacity="${opacity * 0.7}" ${attrs} />`;
}

function renderHanddrawnPolygonShape(
  element: NormalizedElement,
  points: Point[],
  seed: string,
  rotate: string,
  enableHatch: boolean,
  roughnessScale: number,
  scale: number,
): string {
  const nodes: string[] = [];
  const fillColor = element.backgroundColor;
  const opacity = normalizeOpacity(element.opacity);

  if (fillColor && fillColor !== "transparent") {
    nodes.push(`<path d="${polygonPath(points)}" fill="${escapeXml(fillColor)}" opacity="${opacity}" stroke="none" />`);
    if (enableHatch && element.fillStyle !== "solid") {
      const hatchPath = buildPolygonHatchPath(points, element.strokeWidth * scale, -35);
      nodes.push(
        `<path d="${hatchPath}" fill="none" stroke="${escapeXml(
          fillColor,
        )}" stroke-width="${Math.max(0.4, element.strokeWidth * scale * 0.6)}" opacity="${opacity * 0.7}" />`,
      );
      if (element.fillStyle === "cross-hatch") {
        const hatchPath2 = buildPolygonHatchPath(points, element.strokeWidth * scale, 55);
        nodes.push(
          `<path d="${hatchPath2}" fill="none" stroke="${escapeXml(
            fillColor,
          )}" stroke-width="${Math.max(0.4, element.strokeWidth * scale * 0.6)}" opacity="${opacity * 0.7}" />`,
        );
      }
    }
  }

  nodes.push(
    renderHanddrawnStrokes(element, points, seed, true, scale, 'stroke-linejoin="round"', {
      roughness: 0.8 * roughnessScale,
    }),
  );
  return `<g${rotate}>\n${nodes.join("\n")}\n</g>`;
}

function rectPoints(element: NormalizedShapeElement, transform: CoordinateTransform): Point[] {
  const rawX = Math.min(element.x, element.x + element.width);
  const rawY = Math.min(element.y, element.y + element.height);
  const rawWidth = Math.abs(element.width);
  const rawHeight = Math.abs(element.height);
  const x = transform.x(rawX);
  const y = transform.y(rawY);
  const width = transform.len(rawWidth);
  const height = transform.len(rawHeight);
  const base: Point[] = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  const radius = Math.max(0, element.roundness) * transform.len(1);
  return roundedPolygonPoints(base, radius);
}

function renderRectangleHanddrawn(
  element: NormalizedShapeElement,
  transform: CoordinateTransform,
  sloppinessScale: number,
): string {
  const points = rectPoints(element, transform);
  const rotate = getRotationTransform(element, transform);
  return renderHanddrawnPolygonShape(
    element,
    points,
    `rect:${element.x}:${element.y}`,
    rotate,
    true,
    sloppinessScale,
    transform.len(1),
  );
}

function renderDiamondHanddrawn(
  element: NormalizedShapeElement,
  transform: CoordinateTransform,
  sloppinessScale: number,
): string {
  const points = roundedPolygonPoints(
    diamondPoints(element, transform),
    Math.max(0, element.roundness) * transform.len(1),
  );
  const rotate = getRotationTransform(element, transform);
  return renderHanddrawnPolygonShape(
    element,
    points,
    `diamond:${element.x}:${element.y}`,
    rotate,
    true,
    sloppinessScale,
    transform.len(1),
  );
}

function renderEllipseHanddrawn(
  element: NormalizedShapeElement,
  transform: CoordinateTransform,
  sloppinessScale: number,
): string {
  const cx = transform.x(element.x + element.width / 2);
  const cy = transform.y(element.y + element.height / 2);
  const rx = Math.abs(transform.len(element.width / 2));
  const ry = Math.abs(transform.len(element.height / 2));
  const points = ellipseToPolyline(cx, cy, rx, ry);
  const rotate = getRotationTransform(element, transform);
  const nodes: string[] = [];
  const opacity = normalizeOpacity(element.opacity);

  if (element.backgroundColor && element.backgroundColor !== "transparent") {
    nodes.push(
      `<path d="${polygonPath(points)}" fill="${escapeXml(element.backgroundColor)}" opacity="${opacity}" stroke="none" />`,
    );
    if (element.fillStyle !== "solid") {
      const hatchStroke = Math.max(0.4, element.strokeWidth * transform.len(1) * 0.6);
      const hatchPath = buildPolygonHatchPath(points, element.strokeWidth * transform.len(1), -35);
      nodes.push(
        `<path d="${hatchPath}" fill="none" stroke="${escapeXml(
          element.backgroundColor,
        )}" stroke-width="${hatchStroke}" opacity="${opacity * 0.7}" />`,
      );
      if (element.fillStyle === "cross-hatch") {
        const hatchPath2 = buildPolygonHatchPath(points, element.strokeWidth * transform.len(1), 55);
        nodes.push(
          `<path d="${hatchPath2}" fill="none" stroke="${escapeXml(
            element.backgroundColor,
          )}" stroke-width="${hatchStroke}" opacity="${opacity * 0.7}" />`,
        );
      }
    }
  }
  nodes.push(
    renderHanddrawnStrokes(
      element,
      points,
      `ellipse:${element.x}:${element.y}`,
      true,
      transform.len(1),
      'stroke-linejoin="round"',
      {
        roughness: 0.9 * sloppinessScale,
      },
    ),
  );
  return `<g${rotate}>\n${nodes.join("\n")}\n</g>`;
}

function renderLineLikeHanddrawn(
  element: NormalizedLineLikeElement,
  transform: CoordinateTransform,
  withArrowHead: boolean,
  sloppinessScale: number,
): string {
  const absolutePoints = element.points.map((p) => pointToAbs(element, p));
  if (!absolutePoints.length) {
    absolutePoints.push([element.x, element.y]);
  }

  const points = absolutePoints.map(([x, y]) => [transform.x(x), transform.y(y)] as Point);
  const canUseVariableFill =
    element.strokeStyle === "solid" && element.strokeWidth >= 1.8 && points.length >= 2;
  const scaledStrokeWidth = Math.max(0.5, element.strokeWidth * transform.len(1));

  const renderVariableWidthFill = (seed: string, roughness: number): string => {
    const d = variableWidthStrokeFillPath(points, {
      seed,
      strokeWidth: scaledStrokeWidth,
      roughness,
    });
    if (!d) {
      return "";
    }
    const opacity = normalizeOpacity(element.opacity);
    const color = escapeXml(element.strokeColor);
    if (roughness < 0.85) {
      return `<path d="${d}" fill="${color}" opacity="${opacity}" />`;
    }
    const d2 = variableWidthStrokeFillPath(points, {
      seed: `${seed}:layer2`,
      strokeWidth: scaledStrokeWidth * (roughness >= 1.4 ? 0.92 : 0.97),
      roughness: roughness * 1.1,
    });
    if (!d2) {
      return `<path d="${d}" fill="${color}" opacity="${opacity}" />`;
    }
    const layer2Opacity = opacity * (roughness >= 1.4 ? 0.22 : 0.18);
    return `<path d="${d}" fill="${color}" opacity="${opacity}" />\n<path d="${d2}" fill="${color}" opacity="${layer2Opacity}" />`;
  };

  if (!withArrowHead || points.length < 2) {
    const roughness = (element.strokeWidth >= 4 ? 0.5 : 0.7) * sloppinessScale;
    if (canUseVariableFill) {
      const fillPath = renderVariableWidthFill(`line:${element.x}:${element.y}:${points.length}`, roughness);
      if (fillPath) {
        return fillPath;
      }
    }
    return renderHanddrawnStrokes(
      element,
      points,
      `line:${element.x}:${element.y}:${points.length}`,
      false,
      transform.len(1),
      'stroke-linejoin="round" stroke-linecap="round"',
      {
        roughness,
        doubleStroke: element.strokeWidth < 4,
      },
    );
  }

  const tip = points[points.length - 1];
  let prev = points[points.length - 2];
  for (let i = points.length - 2; i >= 0; i -= 1) {
    if (points[i][0] !== tip[0] || points[i][1] !== tip[1]) {
      prev = points[i];
      break;
    }
  }

  const headSize = Math.max(8, element.strokeWidth * 4) * transform.len(1);
  const shaftPoints = points.slice();
  const shaftRoughness = (element.strokeWidth >= 4 ? 0.2 : 0.3) * sloppinessScale;

  const shaftSeed = `arrow:${element.x}:${element.y}:${points.length}`;
  const shaft =
    canUseVariableFill
      ? renderVariableWidthFill(shaftSeed, shaftRoughness)
      : renderHanddrawnStrokes(
          element,
          shaftPoints,
          shaftSeed,
          false,
          transform.len(1),
          'stroke-linejoin="round" stroke-linecap="round"',
          { roughness: shaftRoughness, doubleStroke: false },
        );
  const head = arrowHead(tip, prev, headSize);
  const stroke = escapeXml(element.strokeColor);
  const opacity = normalizeOpacity(element.opacity);
  const headStrokeWidth = Math.max(0.5, element.strokeWidth * transform.len(1));
  const headStrokeStyle = strokeStyleAttrs(element, transform.len(1));
  const headStyle = headStrokeStyle ? ` ${headStrokeStyle}` : "";
  const headLine1 = `<path d="M ${head[0][0]} ${head[0][1]} L ${head[1][0]} ${head[1][1]}" fill="none" stroke="${stroke}" stroke-width="${headStrokeWidth}" opacity="${opacity}" stroke-linejoin="round" stroke-linecap="round"${headStyle} />`;
  const headLine2 = `<path d="M ${head[0][0]} ${head[0][1]} L ${head[2][0]} ${head[2][1]}" fill="none" stroke="${stroke}" stroke-width="${headStrokeWidth}" opacity="${opacity}" stroke-linejoin="round" stroke-linecap="round"${headStyle} />`;

  return `${shaft}\n${headLine1}\n${headLine2}`;
}

function renderElementsClean(
  elements: NormalizedElement[],
  transform: CoordinateTransform,
  fillPatterns: FillPatternCatalog,
  imageClips: ImageClipCatalog,
): string {
  return elements
    .map((element) => {
      switch (element.type) {
        case "rectangle":
          return renderRectangleClean(element, transform, fillPatterns.ids);
        case "ellipse":
          return renderEllipseClean(element, transform, fillPatterns.ids);
        case "diamond":
          return renderDiamondClean(element, transform, fillPatterns.ids);
        case "line":
          return renderLineLikeClean(element, transform, false);
        case "arrow":
          return renderLineLikeClean(element, transform, true);
        case "text":
          return renderText(element, transform);
        case "image":
          return renderImage(element, transform, imageClips);
      }
    })
    .join("\n");
}

function renderElementsHanddrawn(
  elements: NormalizedElement[],
  transform: CoordinateTransform,
  elementsById: Map<string, NormalizedElement>,
  imageClips: ImageClipCatalog,
): string {
  const strokeGainByRoughness = (roughness: number): number => {
    if (roughness <= 1) {
      return 1;
    }
    return Math.min(1.2, 1 + (roughness - 1) * 0.12);
  };

  const sloppinessScaleByRoughness = (roughness: number): number => {
    if (roughness <= 0) {
      return 0.55;
    }
    if (roughness <= 1) {
      return 0.55 + roughness * 0.45;
    }
    if (roughness <= 2) {
      return 1 + (roughness - 1) * 0.65;
    }
    return Math.min(2, 1.65 + (roughness - 2) * 0.15);
  };

  return elements
    .map((element) => {
      const sloppinessScale = sloppinessScaleByRoughness(element.roughness);
      const effectiveElement: NormalizedElement = {
        ...element,
        strokeWidth: element.strokeWidth * strokeGainByRoughness(element.roughness),
      };
      switch (effectiveElement.type) {
        case "rectangle":
          return renderRectangleHanddrawn(effectiveElement, transform, sloppinessScale);
        case "ellipse":
          return renderEllipseHanddrawn(effectiveElement, transform, sloppinessScale);
        case "diamond":
          return renderDiamondHanddrawn(effectiveElement, transform, sloppinessScale);
        case "line":
          return renderLineLikeHanddrawn(effectiveElement, transform, false, sloppinessScale);
        case "arrow":
          return renderLineLikeHanddrawn(effectiveElement, transform, true, sloppinessScale);
        case "text":
          return renderText(positionedText(effectiveElement, transform, elementsById), transform);
        case "image":
          return renderImage(effectiveElement, transform, imageClips);
      }
    })
    .join("\n");
}

export function buildSvg(scene: RawExcalidrawScene, options: CliOptions): string {
  const elements = normalizeElements(scene.elements ?? [], scene.files ?? {});
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  const hasText = elements.some((element) => element.type === "text");
  const hasImageElements = elements.some((element) => element.type === "image");
  const imageClips: ImageClipCatalog = { defs: [], nextId: 1 };
  const fillPatterns = { defs: "", ids: new Map<string, string>() };
  const bounds = computeSceneBounds(elements);
  const transform = createTransform(bounds, options.padding, options.scale);
  const width = Math.max(1, (bounds.maxX - bounds.minX + options.padding * 2) * options.scale);
  const height = Math.max(1, (bounds.maxY - bounds.minY + options.padding * 2) * options.scale);
  const background = scene.appState?.viewBackgroundColor || "transparent";

  const nodes = renderElementsHanddrawn(elements, transform, elementsById, imageClips);

  const defsParts: string[] = [];
  if (fillPatterns.defs) {
    defsParts.push(fillPatterns.defs);
  }
  defsParts.push(...imageClips.defs);
  if (hasText) {
    const virgilCss = getEmbeddedVirgilCss();
    if (virgilCss) {
      defsParts.push(`<style>${virgilCss}</style>`);
    }
  }
  const defs = defsParts.length > 0 ? `<defs>\n${defsParts.join("\n")}\n</defs>\n` : "";
  const xlinkNamespace = hasImageElements ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"${xlinkNamespace} version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(background)}" />
${defs}
${nodes}
</svg>
`;
}
