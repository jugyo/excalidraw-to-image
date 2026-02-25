import {
  IMAGE_DATA_URL_PATTERN,
  MAX_IMAGE_DATA_URL_LENGTH,
  SUPPORTED_TYPES,
} from "./constants";
import type {
  NormalizedCommonElement,
  NormalizedElement,
  NormalizedImageCrop,
  NormalizedImageElement,
  NormalizedLineLikeElement,
  NormalizedShapeElement,
  NormalizedTextElement,
  Point,
  RawExcalidrawElement,
  RawSceneFile,
} from "./types";
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

function normalizeCrop(crop: unknown): NormalizedImageCrop | undefined {
  if (!crop || typeof crop !== "object") {
    return undefined;
  }

  const candidate = crop as {
    x?: unknown;
    y?: unknown;
    width?: unknown;
    height?: unknown;
  };
  const width = ensureNumber(candidate.width, NaN);
  const height = ensureNumber(candidate.height, NaN);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }

  return {
    x: ensureNumber(candidate.x, 0),
    y: ensureNumber(candidate.y, 0),
    width,
    height,
  };
}

function makeBaseElement(element: RawExcalidrawElement): NormalizedCommonElement {
  const fillStyle =
    element.fillStyle === "hachure" || element.fillStyle === "cross-hatch"
      ? element.fillStyle
      : "solid";
  const strokeStyle =
    element.strokeStyle === "dashed" || element.strokeStyle === "dotted"
      ? element.strokeStyle
      : "solid";

  let roundness = 0;
  if (typeof element.roundness === "number") {
    roundness = Math.max(0, ensureNumber(element.roundness, 0));
  } else if (element.roundness && typeof element.roundness === "object") {
    const candidate = element.roundness as { value?: unknown; type?: unknown };
    if (Number.isFinite(candidate.value)) {
      roundness = Math.max(0, ensureNumber(candidate.value, 0));
    } else if (ensureNumber(candidate.type, 0) > 0) {
      const w = Math.abs(ensureNumber(element.width, 0));
      const h = Math.abs(ensureNumber(element.height, 0));
      const adaptive = Math.min(w, h) * 0.2;
      roundness = Math.max(6, Math.min(32, adaptive));
    }
  }

  return {
    id: element.id || "",
    x: ensureNumber(element.x, 0),
    y: ensureNumber(element.y, 0),
    width: ensureNumber(element.width, 0),
    height: ensureNumber(element.height, 0),
    angle: ensureNumber(element.angle, 0),
    strokeColor: element.strokeColor || "#000000",
    backgroundColor: element.backgroundColor || "transparent",
    fillStyle,
    strokeWidth: ensureNumber(element.strokeWidth, 1),
    strokeStyle,
    roughness: ensureNumber(element.roughness, 1),
    opacity: ensureNumber(element.opacity, 100),
    roundness,
  };
}

function normalizeImageElement(
  element: RawExcalidrawElement,
  files: Record<string, RawSceneFile>,
): NormalizedImageElement | undefined {
  const fileId = element.fileId;
  if (!fileId || typeof fileId !== "string") {
    console.warn(`Skipping image element${element.id ? ` (${element.id})` : ""}: missing fileId`);
    return undefined;
  }

  const file = files[fileId];
  if (!file) {
    console.warn(`Skipping image element${element.id ? ` (${element.id})` : ""}: file not found`);
    return undefined;
  }
  if (typeof file.dataURL !== "string") {
    console.warn(`Skipping image element${element.id ? ` (${element.id})` : ""}: missing dataURL`);
    return undefined;
  }
  if (file.dataURL.length > MAX_IMAGE_DATA_URL_LENGTH) {
    console.warn(
      `Skipping image element${element.id ? ` (${element.id})` : ""}: dataURL exceeds limit`,
    );
    return undefined;
  }

  const match = file.dataURL.match(IMAGE_DATA_URL_PATTERN);
  if (!match) {
    console.warn(
      `Skipping image element${element.id ? ` (${element.id})` : ""}: invalid or unsupported MIME`,
    );
    return undefined;
  }

  const base = makeBaseElement(element);
  return {
    ...base,
    type: "image",
    fileId,
    dataURL: file.dataURL,
    mimeType: match[1].toLowerCase(),
    crop: normalizeCrop(element.crop),
  };
}

function toNormalizedElement(
  element: RawExcalidrawElement,
  files: Record<string, RawSceneFile>,
): NormalizedElement | undefined {
  if (element.type === "image") {
    return normalizeImageElement(element, files);
  }

  const base = makeBaseElement(element);
  if (element.type === "line" || element.type === "arrow") {
    const lineElement: NormalizedLineLikeElement = {
      ...base,
      type: element.type,
      points: normalizePoints(element.points),
    };
    return lineElement;
  }

  if (element.type === "text") {
    const textElement: NormalizedTextElement = {
      ...base,
      type: "text",
      text: element.text ?? "",
      fontSize: ensureNumber(element.fontSize, 20),
      fontFamily: ensureNumber(element.fontFamily, 1),
      lineHeight: ensureNumber(element.lineHeight, 1.2),
      containerId: element.containerId,
      textAlign:
        element.textAlign === "left" || element.textAlign === "right" || element.textAlign === "center"
          ? element.textAlign
          : "left",
      verticalAlign:
        element.verticalAlign === "top" || element.verticalAlign === "bottom" || element.verticalAlign === "middle"
          ? element.verticalAlign
          : "top",
    };
    return textElement;
  }

  const shapeElement: NormalizedShapeElement = {
    ...base,
    type: element.type as NormalizedShapeElement["type"],
  };
  return shapeElement;
}

export function normalizeElements(
  elements: RawExcalidrawElement[],
  files: Record<string, RawSceneFile> = {},
): NormalizedElement[] {
  return elements
    .filter((element): element is RawExcalidrawElement => {
      if (!element || element.isDeleted) {
        return false;
      }
      return SUPPORTED_TYPES.has(element.type as NormalizedElement["type"]);
    })
    .map((element) => toNormalizedElement(element, files))
    .filter((element): element is NormalizedElement => Boolean(element));
}
