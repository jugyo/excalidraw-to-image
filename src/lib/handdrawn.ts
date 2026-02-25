import type { Point } from "./types";

export type JitterPathOptions = {
  seed: string;
  strokeWidth: number;
  closed?: boolean;
  amplitudeScale?: number;
};

export type DoubleStrokePath = {
  primaryPath: string;
  secondaryPath: string;
};

export type VariableWidthStrokeOptions = {
  seed: string;
  strokeWidth: number;
  roughness: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function toPath(points: Point[], closed: boolean): string {
  if (!points.length) {
    return "";
  }

  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${points[i][0]} ${points[i][1]}`;
  }
  if (closed) {
    d += " Z";
  }
  return d;
}

export function jitterPath(points: Point[], options: JitterPathOptions): string {
  return toPath(jitterPolyline(points, options), Boolean(options.closed));
}

export function jitterPolyline(points: Point[], options: JitterPathOptions): Point[] {
  if (points.length < 2) {
    return [];
  }

  const closed = Boolean(options.closed);
  const segmentCount = closed ? points.length : points.length - 1;
  // Dampen wobble for thicker strokes to better match Excalidraw rendering.
  const strokeWidth = Math.max(1, options.strokeWidth || 1);
  const widthDamping = 1 / Math.pow(strokeWidth, 0.32);
  // Allow higher ceiling so roughness=2 visibly differs from roughness=1.
  const ampBase = clamp(0.9 * widthDamping * (options.amplitudeScale ?? 1), 0.12, 1.2);
  const rand = mulberry32(hashString(options.seed));
  const jittered: Point[] = [];

  for (let i = 0; i < segmentCount; i += 1) {
    const from = points[i];
    const to = points[(i + 1) % points.length];
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const segLen = Math.hypot(dx, dy);

    if (segLen < 0.001) {
      continue;
    }

    const nx = -dy / segLen;
    const ny = dx / segLen;
    const amp = Math.min(ampBase, segLen * 0.2);
    const steps = clamp(Math.ceil(segLen / 18), 1, 8);

    for (let step = i === 0 ? 0 : 1; step <= steps; step += 1) {
      const t = step / steps;
      const x = from[0] + dx * t;
      const y = from[1] + dy * t;

      let edgeFactor = 1;
      if (!closed) {
        const progress = (i + t) / segmentCount;
        edgeFactor = Math.min(1, progress * 3, (1 - progress) * 3);
      }

      const offset = (rand() * 2 - 1) * amp * edgeFactor;
      jittered.push([x + nx * offset, y + ny * offset]);
    }
  }

  return jittered;
}

export function doubleStrokePath(points: Point[], options: JitterPathOptions): DoubleStrokePath {
  return {
    primaryPath: jitterPath(points, options),
    secondaryPath: jitterPath(points, {
      ...options,
      seed: `${options.seed}:2`,
      amplitudeScale: (options.amplitudeScale ?? 1) * 0.9,
    }),
  };
}

export function polygonPath(points: Point[]): string {
  return toPath(points, true);
}

function normalizeVector(x: number, y: number): Point {
  const len = Math.hypot(x, y);
  if (len < 1e-6) {
    return [0, 0];
  }
  return [x / len, y / len];
}

export function variableWidthStrokeFillPath(points: Point[], options: VariableWidthStrokeOptions): string {
  const centerline = jitterPolyline(points, {
    seed: options.seed,
    strokeWidth: options.strokeWidth,
    closed: false,
    amplitudeScale: options.roughness,
  });
  if (centerline.length < 2) {
    return "";
  }

  const baseWidth = Math.max(0.8, options.strokeWidth);
  const roughness = Math.max(0, options.roughness);
  const variation = clamp(0.08 + roughness * 0.12, 0.06, 0.34);
  const rand = mulberry32(hashString(`${options.seed}:width`));

  const widths: number[] = [];
  for (let i = 0; i < centerline.length; i += 1) {
    const jitter = (rand() * 2 - 1) * variation;
    const raw = baseWidth * (1 + jitter);
    const prev = i > 0 ? widths[i - 1] : raw;
    const smooth = prev * 0.7 + raw * 0.3;
    widths.push(clamp(smooth, baseWidth * 0.65, baseWidth * 1.45));
  }

  const tangents: Point[] = [];
  for (let i = 0; i < centerline.length; i += 1) {
    const prev = centerline[Math.max(0, i - 1)];
    const next = centerline[Math.min(centerline.length - 1, i + 1)];
    const [tx, ty] = normalizeVector(next[0] - prev[0], next[1] - prev[1]);
    if (Math.abs(tx) < 1e-6 && Math.abs(ty) < 1e-6) {
      tangents.push(i > 0 ? tangents[i - 1] : [1, 0]);
      continue;
    }
    tangents.push([tx, ty]);
  }

  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < centerline.length; i += 1) {
    const [tx, ty] = tangents[i];
    const nx = -ty;
    const ny = tx;
    const radius = widths[i] * 0.5;
    left.push([centerline[i][0] + nx * radius, centerline[i][1] + ny * radius]);
    right.push([centerline[i][0] - nx * radius, centerline[i][1] - ny * radius]);
  }

  const startCenter = centerline[0];
  const endCenter = centerline[centerline.length - 1];
  const startNormal = [-tangents[0][1], tangents[0][0]] as Point;
  const endNormal = [-tangents[tangents.length - 1][1], tangents[tangents.length - 1][0]] as Point;
  const startLeftAngle = Math.atan2(startNormal[1], startNormal[0]);
  const startRightAngle = startLeftAngle + Math.PI;
  const endLeftAngle = Math.atan2(endNormal[1], endNormal[0]);
  const capSegments = 6;
  const startCap: Point[] = [];
  const endCap: Point[] = [];

  for (let i = 1; i <= capSegments; i += 1) {
    const t = i / capSegments;
    const angle = startRightAngle + Math.PI * t;
    const radius = widths[0] * 0.5;
    startCap.push([startCenter[0] + Math.cos(angle) * radius, startCenter[1] + Math.sin(angle) * radius]);
  }
  for (let i = 1; i <= capSegments; i += 1) {
    const t = i / capSegments;
    const angle = endLeftAngle + Math.PI * t;
    const radius = widths[widths.length - 1] * 0.5;
    endCap.push([endCenter[0] + Math.cos(angle) * radius, endCenter[1] + Math.sin(angle) * radius]);
  }

  const outline: Point[] = [left[0], ...left.slice(1), ...endCap, right[right.length - 1], ...right.slice(0, -1).reverse(), ...startCap];
  return polygonPath(outline);
}

export function ellipseToPolyline(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  segments = 28,
): Point[] {
  const safeSegments = Math.max(12, segments);
  const pts: Point[] = [];
  for (let i = 0; i < safeSegments; i += 1) {
    const t = (i / safeSegments) * Math.PI * 2;
    pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
  }
  return pts;
}

function boundsOf(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY };
}

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

function uniquePoints(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    if (!result.some((p) => approxEqual(p[0], point[0]) && approxEqual(p[1], point[1]))) {
      result.push(point);
    }
  }
  return result;
}

export function buildPolygonHatchPath(points: Point[], strokeWidth: number, angleDeg: number): string {
  const { minX, minY, maxX, maxY } = boundsOf(points);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const spacing = clamp(strokeWidth * 4.2, 6, 14);
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;
  const reach = Math.hypot(width, height) + spacing * 2;
  const radians = (angleDeg * Math.PI) / 180;
  const dirX = Math.cos(radians);
  const dirY = Math.sin(radians);
  const normalX = -dirY;
  const normalY = dirX;

  const segments: string[] = [];
  for (let offset = -reach; offset <= reach; offset += spacing) {
    const intersections: Point[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const da = (a[0] - centerX) * normalX + (a[1] - centerY) * normalY - offset;
      const db = (b[0] - centerX) * normalX + (b[1] - centerY) * normalY - offset;

      if (approxEqual(da, 0)) {
        intersections.push(a);
      }
      if (da * db < 0) {
        const t = da / (da - db);
        intersections.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }

    const unique = uniquePoints(intersections);
    if (unique.length < 2) {
      continue;
    }
    unique.sort((p1, p2) => p1[0] * dirX + p1[1] * dirY - (p2[0] * dirX + p2[1] * dirY));
    const start = unique[0];
    const end = unique[unique.length - 1];
    segments.push(`M ${start[0]} ${start[1]} L ${end[0]} ${end[1]}`);
  }

  return segments.join(" ");
}
