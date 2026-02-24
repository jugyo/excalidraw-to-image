#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const SUPPORTED_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "text",
]);

const FONT_FAMILY_MAP = {
  1: "Noto Sans JP, sans-serif",
  2: "Virgil, sans-serif",
  3: "Cascadia, monospace",
};

function parseArgs(argv) {
  const args = {
    in: "",
    out: "",
    padding: 24,
    scale: 1,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--in") {
      args.in = argv[++i] ?? "";
    } else if (token === "--out") {
      args.out = argv[++i] ?? "";
    } else if (token === "--padding") {
      args.padding = Number(argv[++i]);
    } else if (token === "--scale") {
      args.scale = Number(argv[++i]);
    } else if (token === "--help" || token === "-h") {
      printUsageAndExit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!args.in || !args.out) {
    throw new Error("--in and --out are required");
  }
  if (!Number.isFinite(args.padding) || args.padding < 0) {
    throw new Error("--padding must be a number >= 0");
  }
  if (!Number.isFinite(args.scale) || args.scale <= 0) {
    throw new Error("--scale must be a number > 0");
  }

  return args;
}

function printUsageAndExit(code) {
  const usage = [
    "Usage:",
    "  node scripts/excalidraw-to-svg.mjs --in <input.json> --out <output.svg> [--padding 24] [--scale 1]",
  ].join("\n");
  console.error(usage);
  process.exit(code);
}

function ensureNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeOpacity(value) {
  const pct = ensureNumber(value, 100);
  return Math.max(0, Math.min(100, pct)) / 100;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function pointToAbs(element, point) {
  const px = ensureNumber(point?.[0], 0);
  const py = ensureNumber(point?.[1], 0);
  return [ensureNumber(element.x, 0) + px, ensureNumber(element.y, 0) + py];
}

function computeLineBounds(element) {
  const points = Array.isArray(element.points) ? element.points : [];
  if (!points.length) {
    const x = ensureNumber(element.x, 0);
    const y = ensureNumber(element.y, 0);
    return { minX: x, minY: y, maxX: x, maxY: y };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    const [ax, ay] = pointToAbs(element, p);
    minX = Math.min(minX, ax);
    minY = Math.min(minY, ay);
    maxX = Math.max(maxX, ax);
    maxY = Math.max(maxY, ay);
  }
  return { minX, minY, maxX, maxY };
}

function getElementBounds(element) {
  if (element.type === "line" || element.type === "arrow") {
    return computeLineBounds(element);
  }

  const x = ensureNumber(element.x, 0);
  const y = ensureNumber(element.y, 0);
  const width = ensureNumber(element.width, 0);
  const height = ensureNumber(element.height, 0);
  const x2 = x + width;
  const y2 = y + height;
  return {
    minX: Math.min(x, x2),
    minY: Math.min(y, y2),
    maxX: Math.max(x, x2),
    maxY: Math.max(y, y2),
  };
}

function computeSceneBounds(elements) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const element of elements) {
    const b = getElementBounds(element);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }

  if (!elements.length) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  return { minX, minY, maxX, maxY };
}

function normalizeElement(element) {
  return {
    ...element,
    x: ensureNumber(element.x, 0),
    y: ensureNumber(element.y, 0),
    width: ensureNumber(element.width, 0),
    height: ensureNumber(element.height, 0),
    angle: ensureNumber(element.angle, 0),
    strokeColor: element.strokeColor || "#000000",
    backgroundColor: element.backgroundColor || "transparent",
    strokeWidth: ensureNumber(element.strokeWidth, 1),
    opacity: ensureNumber(element.opacity, 100),
    text: element.text ?? "",
    fontSize: ensureNumber(element.fontSize, 20),
    fontFamily: ensureNumber(element.fontFamily, 1),
    lineHeight: ensureNumber(element.lineHeight, 1.2),
    points: Array.isArray(element.points) ? element.points : [],
  };
}

function createTransform(bounds, padding, scale) {
  return {
    x: (rawX) => (rawX - bounds.minX + padding) * scale,
    y: (rawY) => (rawY - bounds.minY + padding) * scale,
    len: (rawLen) => rawLen * scale,
  };
}

function makeStyleAttrs(element, scale, isText = false) {
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

function getRotationTransform(element, tx, ty, transform) {
  if (!element.angle) {
    return "";
  }
  const centerX = transform.x(tx + element.width / 2);
  const centerY = transform.y(ty + element.height / 2);
  const deg = (element.angle * 180) / Math.PI;
  return ` transform="rotate(${deg} ${centerX} ${centerY})"`;
}

function pointsToSvg(points) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

function arrowHead(last, prev, headSize) {
  const dx = last[0] - prev[0];
  const dy = last[1] - prev[1];
  const norm = Math.hypot(dx, dy) || 1;
  const ux = dx / norm;
  const uy = dy / norm;
  const px = -uy;
  const py = ux;

  const tip = last;
  const baseX = last[0] - ux * headSize;
  const baseY = last[1] - uy * headSize;
  const left = [baseX + px * (headSize * 0.55), baseY + py * (headSize * 0.55)];
  const right = [baseX - px * (headSize * 0.55), baseY - py * (headSize * 0.55)];
  return [tip, left, right];
}

function renderRectangle(element, transform) {
  const x = transform.x(element.x);
  const y = transform.y(element.y);
  const width = transform.len(element.width);
  const height = transform.len(element.height);
  const attrs = makeStyleAttrs(element, transform.len(1));
  const rotate = getRotationTransform(element, element.x, element.y, transform);
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" ${attrs}${rotate} />`;
}

function renderEllipse(element, transform) {
  const cx = transform.x(element.x + element.width / 2);
  const cy = transform.y(element.y + element.height / 2);
  const rx = Math.abs(transform.len(element.width / 2));
  const ry = Math.abs(transform.len(element.height / 2));
  const attrs = makeStyleAttrs(element, transform.len(1));
  const rotate = getRotationTransform(element, element.x, element.y, transform);
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${attrs}${rotate} />`;
}

function renderDiamond(element, transform) {
  const x = element.x;
  const y = element.y;
  const w = element.width;
  const h = element.height;
  const points = [
    [transform.x(x + w / 2), transform.y(y)],
    [transform.x(x + w), transform.y(y + h / 2)],
    [transform.x(x + w / 2), transform.y(y + h)],
    [transform.x(x), transform.y(y + h / 2)],
  ];
  const attrs = makeStyleAttrs(element, transform.len(1));
  const rotate = getRotationTransform(element, element.x, element.y, transform);
  return `<polygon points="${pointsToSvg(points)}" ${attrs}${rotate} />`;
}

function renderLineLike(element, transform, withArrowHead) {
  const absolutePoints = element.points.map((p) => pointToAbs(element, p));
  if (!absolutePoints.length) {
    absolutePoints.push([element.x, element.y]);
  }
  const points = absolutePoints.map(([x, y]) => [transform.x(x), transform.y(y)]);
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

function renderText(element, transform) {
  const fontFamily = FONT_FAMILY_MAP[element.fontFamily] ?? FONT_FAMILY_MAP[1];
  const fontSize = element.fontSize * transform.len(1);
  const lineHeight = element.lineHeight * fontSize;
  const lines = String(element.text).split(/\r?\n/);
  const x = transform.x(element.x);
  const y = transform.y(element.y);
  const attrs = makeStyleAttrs(element, transform.len(1), true);
  const rotate = getRotationTransform(element, element.x, element.y, transform);
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

function renderElement(element, transform) {
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
    default:
      return "";
  }
}

function buildSvg(scene, options) {
  const elements = (scene.elements || [])
    .filter((element) => element && !element.isDeleted && SUPPORTED_TYPES.has(element.type))
    .map(normalizeElement);

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

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    printUsageAndExit(1);
  }

  let scene;
  try {
    const raw = await fs.readFile(args.in, "utf8");
    scene = JSON.parse(raw);
  } catch (error) {
    console.error(`Error: failed to read/parse JSON: ${error.message}`);
    process.exit(1);
  }

  if (!scene || !Array.isArray(scene.elements)) {
    console.error("Error: invalid Excalidraw JSON. 'elements' array is required.");
    process.exit(1);
  }

  const svg = buildSvg(scene, args);
  try {
    await fs.mkdir(path.dirname(args.out), { recursive: true });
    await fs.writeFile(args.out, svg, "utf8");
  } catch (error) {
    console.error(`Error: failed to write SVG: ${error.message}`);
    process.exit(1);
  }

  console.log(`Generated ${args.out}`);
}

main();
