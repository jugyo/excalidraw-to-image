#!/usr/bin/env bun

import fs from "node:fs/promises";
import path from "node:path";
import { svgToPng } from "../src/lib/png";
import { buildSvg } from "../src/lib/svg";
import type { CliOptions, RawExcalidrawScene } from "../src/lib/types";

type ScriptOptions = {
  fixturesDir: string;
  svgOutDir?: string;
  pngOutDir?: string;
  padding: number;
  scale: number;
  level?: string;
};

const USAGE = [
  "Usage:",
  "  bun run scripts/generate-golden.ts [--fixtures-dir tests/fixtures] [--svg-out-dir tests/output/svg] [--png-out-dir tests/output/png] [--padding 24] [--scale 1] [--level l1]",
].join("\n");

function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = {
    fixturesDir: "tests/fixtures",
    svgOutDir: "tests/output/svg",
    pngOutDir: "tests/output/png",
    padding: 24,
    scale: 1,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--fixtures-dir") {
      options.fixturesDir = argv[++i] ?? "";
      continue;
    }
    if (token === "--svg-out-dir") {
      options.svgOutDir = argv[++i] ?? "";
      continue;
    }
    if (token === "--png-out-dir") {
      options.pngOutDir = argv[++i] ?? "";
      continue;
    }
    if (token === "--padding") {
      options.padding = Number(argv[++i]);
      continue;
    }
    if (token === "--scale") {
      options.scale = Number(argv[++i]);
      continue;
    }
    if (token === "--level") {
      options.level = argv[++i] ?? "";
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (!options.fixturesDir) {
    throw new Error("--fixtures-dir is required");
  }
  if (!Number.isFinite(options.padding) || options.padding < 0) {
    throw new Error("--padding must be a number >= 0");
  }
  if (!Number.isFinite(options.scale) || options.scale <= 0) {
    throw new Error("--scale must be a number > 0");
  }
  if (options.level && !/^[a-z0-9_-]+$/i.test(options.level)) {
    throw new Error("--level must be an alphanumeric path segment");
  }

  return options;
}

async function collectJsonFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const collected: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "failure") {
        continue;
      }
      collected.push(...(await collectJsonFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      collected.push(fullPath);
    }
  }

  return collected;
}

function toCliOptions(padding: number, scale: number): CliOptions {
  return {
    in: "",
    out: "",
    padding,
    scale,
  };
}

async function loadScene(filePath: string): Promise<RawExcalidrawScene> {
  const raw = await fs.readFile(filePath, "utf8");
  const scene = JSON.parse(raw) as RawExcalidrawScene;
  if (!scene || !Array.isArray(scene.elements)) {
    throw new Error(`Invalid Excalidraw JSON: 'elements' array is required (${filePath})`);
  }
  return scene;
}

async function main(): Promise<void> {
  let options: ScriptOptions;
  try {
    options = parseArgs(process.argv);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    console.error(USAGE);
    process.exit(1);
  }

  const fixturesRoot = path.resolve(options.fixturesDir);
  const svgOutputRoot = path.resolve(options.svgOutDir ?? "tests/output/svg");
  const pngOutputRoot = path.resolve(options.pngOutDir ?? "tests/output/png");
  const targetRoot = options.level ? path.join(fixturesRoot, options.level) : fixturesRoot;

  const fixtures = (await collectJsonFiles(targetRoot)).sort();
  if (!fixtures.length) {
    console.log(`No fixture files found: ${targetRoot}`);
    return;
  }

  const cliOptions = toCliOptions(options.padding, options.scale);
  let generated = 0;

  for (const fixturePath of fixtures) {
    const relativePath = path.relative(fixturesRoot, fixturePath);
    const svgRelative = relativePath.replace(/\.json$/i, ".svg");
    const pngRelative = relativePath.replace(/\.json$/i, ".png");
    const svgOutPath = path.join(svgOutputRoot, svgRelative);
    const pngOutPath = path.join(pngOutputRoot, pngRelative);

    const scene = await loadScene(fixturePath);
    const svg = buildSvg(scene, cliOptions);
    const png = svgToPng(svg);

    await fs.mkdir(path.dirname(svgOutPath), { recursive: true });
    await fs.writeFile(svgOutPath, svg, "utf8");
    await fs.mkdir(path.dirname(pngOutPath), { recursive: true });
    await fs.writeFile(pngOutPath, png);
    generated += 1;
    console.log(`Generated ${path.relative(process.cwd(), svgOutPath)}`);
    console.log(`Generated ${path.relative(process.cwd(), pngOutPath)}`);
  }

  console.log(`Done. Generated ${generated} fixture pairs (SVG + PNG).`);
}

void main();
