import fs from "node:fs/promises";
import path from "node:path";
import { CliUsageError, parseCliArgs, printUsage } from "./args";
import { THIRD_PARTY_LICENSES_RELATIVE_PATH } from "./constants";
import type { CliOptions, RawExcalidrawScene } from "./types";

export function parseArgsOrExit(argv: string[], usage: string): CliOptions {
  try {
    return parseCliArgs(argv);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof CliUsageError && message.length === 0) {
      printUsage("stdout", usage);
      process.exit(0);
    }
    console.error(`Error: ${message}`);
    printUsage("stderr", usage);
    process.exit(1);
  }
}

export async function printLicenses(): Promise<void> {
  const licensesPath = path.resolve(import.meta.dir, THIRD_PARTY_LICENSES_RELATIVE_PATH);
  try {
    const content = await fs.readFile(licensesPath, "utf8");
    console.log(content.trimEnd());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to read third-party licenses: ${message}`);
  }
}

export async function loadSceneOrExit(inputPath: string): Promise<RawExcalidrawScene> {
  let scene: RawExcalidrawScene;
  try {
    const raw = await fs.readFile(inputPath, "utf8");
    scene = JSON.parse(raw) as RawExcalidrawScene;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: failed to read/parse JSON: ${message}`);
    process.exit(1);
  }

  if (!scene || !Array.isArray(scene.elements)) {
    console.error("Error: invalid Excalidraw JSON. 'elements' array is required.");
    process.exit(1);
  }

  return scene;
}

export async function writeOutputOrExit(
  outputPath: string,
  data: string | Uint8Array,
  kind: "SVG" | "PNG",
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: failed to write ${kind}: ${message}`);
    process.exit(1);
  }
}
