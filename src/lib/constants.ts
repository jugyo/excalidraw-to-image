import type { SupportedElementType } from "./types";

export const SUPPORTED_TYPES = new Set<SupportedElementType>([
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "text",
  "image",
]);

export const IMAGE_DATA_URL_PATTERN =
  /^data:(image\/(png|jpeg|webp|svg\+xml|gif));base64,/i;

export const MAX_IMAGE_DATA_URL_LENGTH = 20 * 1024 * 1024;

export const FONT_FAMILY_MAP: Record<number, string> = {
  1: "Noto Sans JP, sans-serif",
  2: "Virgil, sans-serif",
  3: "Cascadia, monospace",
};

export const CLI_USAGE = [
  "Usage:",
  "  bun run src/cli/excalidraw-to-image.ts --in <input.json> --out <output.(png|svg)> [--padding 24] [--scale 1]",
].join("\n");
